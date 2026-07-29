import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import DocumentModel from "../models/Document";
import UserModel from "../models/User";
import { AuthPayload } from "../middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET as string;

// In-memory Yjs documents per docId
const ydocs = new Map<string, Y.Doc>();
const socketAwarenessClients = new Map<string, Set<number>>();
const connectedUsers = new Map<string, Set<string>>();
let ioServer: Server | null = null;
// Cache the most recent awareness update (base64) per document so joiners
// can be sent a snapshot immediately on connect.
const awarenessSnapshots = new Map<string, string>();

// Track users per room: docId -> Set<{ socketId, username, collabId, color }>
const roomUsers = new Map<
  string,
  Map<
    string,
    { username: string; collabId: string; color: string; userId: string }
  >
>();

function getYDoc(docId: string): Y.Doc {
  if (!ydocs.has(docId)) ydocs.set(docId, new Y.Doc());
  return ydocs.get(docId)!;
}

function getUserColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 65;
  const lightness = 55;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function emitInvitationUpdate(
  userId: string,
  payload: Record<string, unknown>,
) {
  if (!ioServer) return;

  const sockets = connectedUsers.get(userId);
  if (!sockets || sockets.size === 0) return;

  ioServer.to(Array.from(sockets)).emit("invitation-updated", payload);
}

export function setupSocket(io: Server) {
  ioServer = io;

  // Auth middleware for socket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;

      const user = await UserModel.findById(decoded.userId).select(
        "email username collabId activeSessionId tokenVersion",
      );
      if (
        !user ||
        user.activeSessionId !== decoded.sessionId ||
        Number(user.tokenVersion || 0) !== Number(decoded.tokenVersion || 0)
      ) {
        return next(new Error("Session expired"));
      }

      (socket as any).user = {
        userId: decoded.userId,
        email: user.email,
        username: user.username,
        collabId: user.collabId,
        sessionId: decoded.sessionId,
        tokenVersion: Number(user.tokenVersion || 0),
      } as AuthPayload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = (socket as any).user as AuthPayload;

    if (!connectedUsers.has(user.userId)) {
      connectedUsers.set(user.userId, new Set());
    }
    connectedUsers.get(user.userId)!.add(socket.id);

    // Join a document room
    socket.on("join-document", async ({ docId }: { docId: string }) => {
      try {
        // Verify access
        const doc = await DocumentModel.findOne({ docId });
        if (!doc) return socket.emit("error", "Document not found");

        const isOwner = doc.owner.toString() === user.userId;
        const collab = doc.collaborators.find(
          (c) => c.userId.toString() === user.userId,
        );
        if (!isOwner && !collab) return socket.emit("error", "Access denied");

        socket.join(docId);

        // Track user in room
        if (!roomUsers.has(docId)) roomUsers.set(docId, new Map());
        const roomMap = roomUsers.get(docId)!;
        roomMap.set(socket.id, {
          username: user.username,
          collabId: user.collabId,
          color: getUserColor(user.userId),
          userId: user.userId,
        });

        // Load Yjs state from MongoDB and apply
        const ydoc = getYDoc(docId);
        if (doc.content) {
          try {
            const stateBuffer = Buffer.from(doc.content, "base64");
            Y.applyUpdate(ydoc, stateBuffer);
          } catch {}
        }

        // Send current state to joining client
        const state = Y.encodeStateAsUpdate(ydoc);
        socket.emit("load-document", {
          state: Buffer.from(state).toString("base64"),
          accessLevel: isOwner ? "owner" : collab!.accessLevel,
          color: roomMap.get(socket.id)!.color,
          externalTasks: doc.externalTasks || [],
        });

        // Broadcast updated user list
        io.to(docId).emit("room-users", Array.from(roomMap.values()));

        // If we have a cached awareness snapshot for this doc, send it to the
        // joining socket so they immediately receive current presence.
        if (awarenessSnapshots.has(docId)) {
          try {
            const cached = awarenessSnapshots.get(docId)!;
            socket.emit("awareness-update", { update: cached });
          } catch {}
        }

        // Ask existing collaborators to re-broadcast their awareness state so
        // the joining client receives the current presence map immediately.
        socket.to(docId).emit("request-awareness", { docId });
      } catch (err) {
        socket.emit("error", "Failed to join document");
      }
    });

    // Receive Yjs delta from a client and broadcast
    socket.on(
      "send-changes",
      async ({ docId, update }: { docId: string; update: string }) => {
        try {
          const ydoc = getYDoc(docId);
          const updateBuffer = Buffer.from(update, "base64");
          Y.applyUpdate(ydoc, updateBuffer);

          // Broadcast to others
          socket.to(docId).emit("receive-changes", update);

          // Auto-save to MongoDB
          const state = Y.encodeStateAsUpdate(ydoc);
          await DocumentModel.findOneAndUpdate(
            { docId },
            { content: Buffer.from(state).toString("base64") },
            { upsert: false },
          );
        } catch {}
      },
    );

    // Awareness (live cursors / presence) relay
    socket.on(
      "awareness-update",
      ({
        docId,
        update,
        clientIds,
      }: {
        docId: string;
        update: string;
        clientIds: number[];
      }) => {
        if (!socket.rooms.has(docId)) {
          return;
        }

        if (!Array.isArray(clientIds) || clientIds.length === 0) {
          return;
        }

        if (!socketAwarenessClients.has(socket.id)) {
          socketAwarenessClients.set(socket.id, new Set());
        }

        const tracked = socketAwarenessClients.get(socket.id)!;
        clientIds.forEach((id) => tracked.add(id));

        io.to(docId).emit("awareness-update", { update });
        // Cache latest awareness update for future joiners.
        try {
          awarenessSnapshots.set(docId, update);
        } catch {}
      },
    );

    // Owner broadcasts access change in real-time
    socket.on("access-changed", ({ docId, collabId, accessLevel }: any) => {
      io.to(docId).emit("access-changed", { collabId, accessLevel });
    });

    // Owner broadcasts revocation
    socket.on("access-revoked", ({ docId, collabId }: any) => {
      io.to(docId).emit("access-revoked", { collabId });
    });

    // Title changed
    socket.on("title-changed", ({ docId, title }: any) => {
      socket.to(docId).emit("title-changed", title);
    });

    // Media added - broadcast to room
    socket.on("media-added", ({ docId, asset }: any) => {
      socket.to(docId).emit("media-added", asset);
    });

    // Task added - persist and broadcast to room
    socket.on(
      "task-added",
      async ({ docId, text }: { docId: string; text: string }) => {
        try {
          const trimmedText = String(text || "").trim();
          if (!trimmedText) return;

          const doc = await DocumentModel.findOne({ docId });
          if (!doc) return;

          const isOwner = doc.owner.toString() === user.userId;
          const canEdit = doc.collaborators.some(
            (c) =>
              c.userId.toString() === user.userId && c.accessLevel === "edit",
          );
          if (!isOwner && !canEdit) return;

          const task = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            text: trimmedText,
            done: false,
          };

          doc.externalTasks = [...(doc.externalTasks || []), task];
          await doc.save();

          io.to(docId).emit("task-added", task);
        } catch {}
      },
    );

    // Task toggled - persist and broadcast to room
    socket.on(
      "task-toggled",
      async ({ docId, taskId }: { docId: string; taskId: string }) => {
        try {
          const doc = await DocumentModel.findOne({ docId });
          if (!doc) return;

          const isOwner = doc.owner.toString() === user.userId;
          const canEdit = doc.collaborators.some(
            (c) =>
              c.userId.toString() === user.userId && c.accessLevel === "edit",
          );
          if (!isOwner && !canEdit) return;

          const task = (doc.externalTasks || []).find((t) => t.id === taskId);
          if (!task) return;

          task.done = !task.done;
          await doc.save();

          io.to(docId).emit("task-toggled", { taskId, done: task.done });
        } catch {}
      },
    );

    socket.on("disconnect", () => {
      const staleClientIds = Array.from(
        socketAwarenessClients.get(socket.id) || [],
      );
      socketAwarenessClients.delete(socket.id);

      const userSockets = connectedUsers.get(user.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(user.userId);
        }
      }

      // Remove from all rooms
      roomUsers.forEach((roomMap, docId) => {
        if (roomMap.has(socket.id)) {
          roomMap.delete(socket.id);
          io.to(docId).emit("room-users", Array.from(roomMap.values()));
          if (staleClientIds.length > 0) {
            socket.to(docId).emit("awareness-remove", {
              clientIds: staleClientIds,
            });
          }
        }
      });
    });
  });
}
