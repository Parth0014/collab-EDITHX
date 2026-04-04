import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import * as Y from "yjs";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { Document, RoomUser, AccessLevel } from "../types";
import CollabEditor from "../components/CollabEditor.tsx";
import MembersPanel from "../components/MembersPanel";
import MediaPanel from "../components/MediaPanel";
import Toolbar from "../components/Toolbar";
import { Editor } from "@tiptap/react";
import "./EditorPage.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
const REMOTE_ORIGIN = "remote-sync";

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeUint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface Props {
  docId: string;
  onBack: () => void;
}

interface ExternalTask {
  id: string;
  text: string;
  done: boolean;
}

export default function EditorPage({ docId, onBack }: Props) {
  const { token, user } = useAuth();
  const [doc, setDoc] = useState<Document | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("view");
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [myColor, setMyColor] = useState("#3B6978");
  const [showMembers, setShowMembers] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [externalTasks, setExternalTasks] = useState<ExternalTask[]>([]);
  const [tasksPanelOpen, setTasksPanelOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const ydocRef = useRef(new Y.Doc());
  const editorRef = useRef<Editor | null>(null);
  const [ydocReady, setYdocReady] = useState(false);

  useEffect(() => {
    ydocRef.current.destroy();
    ydocRef.current = new Y.Doc();
    setYdocReady(false);
  }, [docId]);

  useEffect(() => {
    setExternalTasks([]);
    setTasksPanelOpen(false);
  }, [docId]);

  useEffect(() => {
    api
      .get(`/documents/${docId}`)
      .then(({ data }) => {
        setDoc(data);
        setTitle(data.title);
        setAccessLevel(data.accessLevel);
      })
      .catch(() => alert("Failed to load document"));
  }, [docId]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    const readyFallback = window.setTimeout(() => setYdocReady(true), 1500);

    socket.on("connect", () => {
      setStatus("connected");
      socket.emit("join-document", { docId });
    });
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on(
      "load-document",
      ({ state, accessLevel: al, color, externalTasks: tasks }: any) => {
        if (state) {
          try {
            Y.applyUpdate(
              ydocRef.current,
              decodeBase64ToUint8Array(state),
              REMOTE_ORIGIN,
            );
          } catch {}
        }

        if (Array.isArray(tasks)) {
          const normalizedTasks = tasks.filter(
            (task) =>
              typeof task?.id === "string" &&
              typeof task?.text === "string" &&
              typeof task?.done === "boolean",
          ) as ExternalTask[];
          setExternalTasks(normalizedTasks);
        }

        setAccessLevel(al);
        setMyColor(color);
        setYdocReady(true);
      },
    );
    socket.on("receive-changes", (base64Update: string) => {
      try {
        Y.applyUpdate(
          ydocRef.current,
          decodeBase64ToUint8Array(base64Update),
          REMOTE_ORIGIN,
        );
      } catch {}
    });
    socket.on("room-users", (users: RoomUser[]) => setRoomUsers(users));
    socket.on("title-changed", (newTitle: string) => setTitle(newTitle));
    socket.on("access-changed", ({ collabId, accessLevel: al }: any) => {
      if (collabId === user?.collabId) setAccessLevel(al);
      setDoc((d) =>
        d
          ? {
              ...d,
              collaborators: d.collaborators.map((c) =>
                c.collabId === collabId ? { ...c, accessLevel: al } : c,
              ),
            }
          : d,
      );
    });
    socket.on("access-revoked", ({ collabId }: any) => {
      if (collabId === user?.collabId) {
        alert("Your access to this document has been revoked.");
        onBack();
      }
    });
    socket.on("media-added", (asset: any) => {
      setDoc((d) =>
        d ? { ...d, mediaAssets: [...(d.mediaAssets || []), asset] } : d,
      );
    });
    socket.on("task-added", (task: ExternalTask) => {
      setExternalTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        return [...prev, task];
      });
    });
    socket.on(
      "task-toggled",
      ({ taskId, done }: { taskId: string; done: boolean }) => {
        setExternalTasks((prev) =>
          prev.map((task) => (task.id === taskId ? { ...task, done } : task)),
        );
      },
    );
    socket.on("error", (msg: string) => alert(msg));

    return () => {
      window.clearTimeout(readyFallback);
      socket.disconnect();
    };
  }, [docId, token]);

  useEffect(() => {
    const handler = (update: Uint8Array, origin: any) => {
      if (origin !== REMOTE_ORIGIN && socketRef.current?.connected) {
        socketRef.current.emit("send-changes", {
          docId,
          update: encodeUint8ArrayToBase64(update),
        });
      }
    };
    ydocRef.current.on("update", handler);
    return () => ydocRef.current.off("update", handler);
  }, [docId]);

  const saveTitle = async () => {
    if (!title.trim()) return;
    try {
      await api.put(`/documents/${docId}/title`, { title });
      socketRef.current?.emit("title-changed", { docId, title });
      setEditingTitle(false);
    } catch {}
  };

  const canEdit = accessLevel === "owner" || accessLevel === "edit";
  const isOwner = accessLevel === "owner";

  const handleAddExternalTask = () => {
    if (!canEdit) return;

    const taskText = prompt("Enter task text:");
    if (taskText === null) return;

    const trimmed = taskText.trim();
    if (!trimmed) return;

    setTasksPanelOpen(true);

    socketRef.current?.emit("task-added", { docId, text: trimmed });
  };

  const toggleExternalTask = (taskId: string) => {
    socketRef.current?.emit("task-toggled", { docId, taskId });
  };

  const statusLabel =
    status === "connected"
      ? "● Live"
      : status === "disconnected"
        ? "● Offline"
        : "● Connecting";
  const statusClass = `editor-status-badge editor-status-${status}`;

  const avatarTones = [
    "editor-avatar-tone-1",
    "editor-avatar-tone-2",
    "editor-avatar-tone-3",
    "editor-avatar-tone-4",
    "editor-avatar-tone-5",
    "editor-avatar-tone-6",
  ];
  const getAvatarToneClass = (collabId: string) => {
    let hash = 0;
    for (let i = 0; i < collabId.length; i += 1) hash += collabId.charCodeAt(i);
    return avatarTones[hash % avatarTones.length];
  };

  return (
    <div className="editor-page">
      {/* ── Top Bar ── */}
      <header className="editor-topbar">
        <button className="btn-ghost btn-sm editor-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="editor-divider" />

        {/* Document icon */}
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: "#3B6978" }}
        >
          description
        </span>

        {/* Title */}
        {editingTitle ? (
          <input
            className="editor-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            title="Document title"
            placeholder="Document title"
            autoFocus
          />
        ) : (
          <span
            className={`editor-title ${canEdit ? "editor-title-editable" : "editor-title-readonly"}`}
            onClick={() => canEdit && setEditingTitle(true)}
          >
            {title || "Untitled"}
          </span>
        )}

        <div className={statusClass}>{statusLabel}</div>
        <div className="editor-access-badge">{accessLevel}</div>

        <div className="editor-spacer" />

        {/* Room users */}
        <div className="editor-avatars">
          {roomUsers.slice(0, 5).map((u, i) => (
            <div
              key={u.collabId}
              title={u.username}
              className={`editor-avatar ${getAvatarToneClass(u.collabId)} ${i === 0 ? "" : "editor-avatar-overlap"}`}
            >
              {u.username[0].toUpperCase()}
            </div>
          ))}
          {roomUsers.length > 5 && (
            <div className="editor-more-users">+{roomUsers.length - 5}</div>
          )}
        </div>

        {/* Action buttons */}
        <button
          className={`btn-secondary btn-sm ${showMedia ? "editor-top-btn-active" : ""}`}
          onClick={() => setShowMedia((v) => !v)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            attach_file
          </span>
          Media
        </button>
        <button
          className={`btn-secondary btn-sm ${showMembers ? "editor-top-btn-active" : ""}`}
          onClick={() => setShowMembers((v) => !v)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            group
          </span>
          Members
        </button>
      </header>

      {/* ── Toolbar ── */}
      {canEdit && editorRef.current && (
        <Toolbar editor={editorRef.current} onAddTask={handleAddExternalTask} />
      )}

      {/* ── Main Layout ── */}
      <div className="editor-main-layout">
        {/* Editor area */}
        <div className="editor-main-area">
          <div className="editor-content-row">
            <button
              type="button"
              className={`external-tasks-handle ${tasksPanelOpen ? "is-open" : "is-closed"}`}
              onClick={() => setTasksPanelOpen((v) => !v)}
              title={tasksPanelOpen ? "Hide task tracker" : "Show task tracker"}
              aria-label={
                tasksPanelOpen ? "Hide task tracker" : "Show task tracker"
              }
            >
              {tasksPanelOpen ? "◀ Tasks" : "▶ Tasks"}
            </button>

            <section
              className={`external-tasks-panel ${tasksPanelOpen ? "is-open" : "is-closed"}`}
              aria-label="Task tracker"
            >
              <div className="external-tasks-header">
                <div className="external-tasks-title">Task Tracker</div>
                <div className="external-tasks-count">
                  {externalTasks.filter((t) => !t.done).length} open /{" "}
                  {externalTasks.length} total
                </div>
              </div>

              <div className="external-tasks-table-wrap">
                <table className="external-tasks-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Task</th>
                    </tr>
                  </thead>
                  <tbody>
                    {externalTasks.length === 0 && (
                      <tr>
                        <td colSpan={2} className="external-tasks-empty">
                          No tasks yet. Click "Tasks" in the toolbar to add one.
                        </td>
                      </tr>
                    )}
                    {externalTasks.map((task) => (
                      <tr key={task.id}>
                        <td className="external-tasks-status-cell">
                          <input
                            type="checkbox"
                            checked={task.done}
                            disabled={!canEdit}
                            onChange={() => toggleExternalTask(task.id)}
                            title={task.done ? "Mark as open" : "Mark as done"}
                          />
                        </td>
                        <td>
                          <span
                            className={
                              task.done
                                ? "external-tasks-text external-tasks-text-done"
                                : "external-tasks-text"
                            }
                          >
                            {task.text}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="editor-sheet-wrap">
              <div className="editor-sheet">
                {/* Sheet label tab */}
                <div className="editor-sheet-label">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 12 }}
                  >
                    description
                  </span>
                  {title || "Untitled"}.md
                  <span style={{ color: "#94A3B8", marginLeft: 12 }}>
                    Edited just now · {user?.username}
                  </span>
                </div>

                {ydocReady && (
                  <CollabEditor
                    ydoc={ydocRef.current}
                    socket={socketRef.current}
                    docId={docId}
                    canEdit={canEdit}
                    myColor={myColor}
                    username={user?.username || "Anonymous"}
                    editorRef={editorRef}
                    mediaAssets={doc?.mediaAssets || []}
                  />
                )}

                {!ydocReady && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 300,
                      fontFamily: "Space Grotesk, sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#94A3B8",
                    }}
                  >
                    Loading document…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Members sidebar */}
        {showMembers && doc && (
          <MembersPanel
            doc={doc}
            isOwner={isOwner}
            socket={socketRef.current}
            onClose={() => setShowMembers(false)}
            onDocUpdate={setDoc}
            currentUserId={user?.collabId}
          />
        )}

        {/* Media sidebar */}
        {showMedia && doc && (
          <MediaPanel
            doc={doc}
            docId={docId}
            canEdit={canEdit}
            isOwner={isOwner}
            socket={socketRef.current}
            onDocUpdate={setDoc}
            onClose={() => setShowMedia(false)}
            onInsertImage={(url, name) => {
              editorRef.current
                ?.chain()
                .focus()
                .setImage({ src: url, alt: name })
                .updateAttributes("image", { width: "250px" })
                .run();
            }}
          />
        )}
      </div>
    </div>
  );
}
