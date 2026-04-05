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

// Track users per room: docId -> Set<{ socketId, username, collabId, color }>
const roomUsers = new Map<
  string,
  Map<
    string,
    { username: string; collabId: string; color: string; userId: string }
  >
>();

const CURSOR_COLORS = [
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#7048e8",
  "#d6336c",
  "#f08c00",
  "#0c8599",
  "#5c7cfa",
];

function getYDoc(docId: string): Y.Doc {
  if (!ydocs.has(docId)) ydocs.set(docId, new Y.Doc());
  return ydocs.get(docId)!;
}

function getUserColor(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

export function setupSocket(io: Server) {
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
        const userIndex = roomMap.size;
        roomMap.set(socket.id, {
          username: user.username,
          collabId: user.collabId,
          color: getUserColor(userIndex),
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

        console.log(`${user.username} joined doc ${docId}`);
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
