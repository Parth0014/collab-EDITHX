import React, { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import * as Y from "yjs";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { usePopup } from "../context/PopupContext";
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
  const { showAlert } = usePopup();
  const { token, user, pendingLoginRequest, resolvePendingLoginRequest } =
    useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hiddenRequests, setHiddenRequests] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("collab_hidden_requests");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const notificationsRef = useRef<HTMLDivElement>(null);
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

  // FIX: Use state for ydoc so React re-renders CollabEditor with the new
  // instance whenever docId changes. A ref alone won't trigger re-renders.
  const [ydoc, setYdoc] = useState<Y.Doc>(() => new Y.Doc());
  const ydocRef = useRef<Y.Doc>(ydoc); // keep a ref in sync for use in callbacks

  const editorRef = useRef<Editor | null>(null);
  const [ydocReady, setYdocReady] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        "collab_hidden_requests",
        JSON.stringify(hiddenRequests),
      );
    } catch {}
  }, [hiddenRequests]);

  // Clear ghost notifications from localStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem("collab_notifications");
      localStorage.removeItem("notifications");
    } catch {}
  }, []);

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
      .catch(() => {
        void showAlert("Failed to load document", "Load Failed");
      });
  }, [docId]);

  // FIX: All ydoc lifecycle + socket setup is in ONE effect keyed on docId.
  // This guarantees the ydoc instance, its update listener, and the socket
  // all reference the same object — no stale closures.
  useEffect(() => {
    console.log("Initializing editor for docId:", docId);

    // 0. Clean up any old socket connection before creating a new one.
    // This prevents cross-tab pollution when multiple tabs are open.
    if (socketRef.current) {
      console.log("Cleaning up old socket connection");
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Track if this effect's socket is still active (hasn't been replaced by a new docId change)
    let isActive = true;

    // 1. Create a fresh ydoc for this document session.
    const freshYdoc = new Y.Doc();
    ydocRef.current = freshYdoc;
    setYdoc(freshYdoc);
    setYdocReady(false);
    setStatus("connecting");

    // 2. Wire the ydoc update → socket emit (local edits → broadcast).
    //    This closure captures freshYdoc directly, so it's always correct.
    const handleYdocUpdate = (update: Uint8Array, origin: any) => {
      if (origin !== REMOTE_ORIGIN && socketRef.current?.connected) {
        socketRef.current.emit("send-changes", {
          docId,
          update: encodeUint8ArrayToBase64(update),
        });
      }
    };
    freshYdoc.on("update", handleYdocUpdate);

    // 3. Connect socket.
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    // Fallback: if server never sends load-document, show editor anyway (after longer wait).
    // Increased to 3000ms to account for network latency and server processing time.
    const readyFallback = window.setTimeout(() => {
      console.warn("Document load timeout - showing editor with current state");
      setYdocReady(true);
    }, 3000);

    socket.on("connect", () => {
      setStatus("connected");
      socket.emit("join-document", { docId });
    });

    socket.on("disconnect", () => setStatus("disconnected"));

    socket.on(
      "load-document",
      ({ state, accessLevel: al, color, externalTasks: tasks }: any) => {
        // Guard: ignore if this effect has been replaced by a newer one
        if (!isActive) {
          console.log(
            "Ignoring load-document for stale effect (tab refreshed)",
          );
          return;
        }

        window.clearTimeout(readyFallback);
        console.log("Document loaded from server", {
          hasState: !!state,
          taskCount: tasks?.length || 0,
          forDocId: docId,
        });

        if (state) {
          try {
            // Apply saved server state into the fresh ydoc.
            Y.applyUpdate(
              freshYdoc,
              decodeBase64ToUint8Array(state),
              REMOTE_ORIGIN,
            );
            console.log("Document state applied successfully");
          } catch (error) {
            console.error("Failed to apply document state:", error);
          }
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
        // FIX: Only show editor AFTER the saved state has been applied.
        setYdocReady(true);
      },
    );

    // FIX: Remote changes from other collaborators → apply to the same freshYdoc.
    // Guard against applying updates to the wrong document (multi-tab isolation).
    socket.on("receive-changes", (base64Update: string) => {
      // Ignore if this effect has been replaced by a newer one (docId changed)
      if (!isActive) {
        console.log("Ignoring receive-changes for stale effect");
        return;
      }

      // CRITICAL: Only apply changes to the current document's ydoc
      // to prevent content from other documents leaking into this tab
      try {
        Y.applyUpdate(
          freshYdoc,
          decodeBase64ToUint8Array(base64Update),
          REMOTE_ORIGIN,
        );
      } catch (error) {
        console.error("Failed to apply remote changes:", error);
      }
    });

    socket.on("room-users", (users: RoomUser[]) => {
      if (!isActive) return;
      setRoomUsers(users);
    });

    socket.on("title-changed", (newTitle: string) => {
      if (!isActive) return;
      setTitle(newTitle);
    });

    socket.on("access-changed", ({ collabId, accessLevel: al }: any) => {
      if (!isActive) return;
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

    // When the server broadcasts a confirmed task, replace any temp optimistic
    // entry with the same text (added by this client) with the real one.
    // For other clients there are no temp entries so it just appends normally.
    socket.on("task-added", (task: ExternalTask) => {
      if (!isActive) return;
      setExternalTasks((prev) => {
        const tempIndex = prev.findIndex(
          (t) => t.id.startsWith("temp-") && t.text === task.text,
        );
        if (tempIndex !== -1) {
          // Replace the temp optimistic entry with the server-confirmed one.
          const next = [...prev];
          next[tempIndex] = task;
          return next;
        }
        // Another collaborator added this task — just append it.
        return [...prev, task];
      });
    });

    // Server broadcasts { taskId, done } so destructure correctly.
    socket.on(
      "task-toggled",
      ({ taskId, done }: { taskId: string; done: boolean }) => {
        if (!isActive) return;
        setExternalTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, done } : t)),
        );
      },
    );

    // 4. Cleanup: disconnect socket and destroy ydoc.
    return () => {
      isActive = false; // Mark this effect as no longer active, ignore future events
      window.clearTimeout(readyFallback);
      freshYdoc.off("update", handleYdocUpdate);
      freshYdoc.destroy();
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, token]);

  // Close notifications panel when clicking outside of it
  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement)
          .closest("button")
          ?.textContent?.includes("Notifications")
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notificationsOpen]);

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

    // Optimistic local add so the task appears immediately for the creator.
    // The server will broadcast the real task (with a server-generated id) to
    // all OTHER clients via "task-added". We replace our temp entry when that
    // comes back (see the dedup logic in the socket listener above).
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setExternalTasks((prev) => [
      ...prev,
      { id: tempId, text: trimmed, done: false },
    ]);

    socketRef.current?.emit("task-added", { docId, text: trimmed });
  };

  const toggleExternalTask = (taskId: string) => {
    // Skip optimistic update for temp tasks that haven't been confirmed yet.
    if (taskId.startsWith("temp-")) return;

    // Optimistic toggle so the checkbox feels instant for the user who clicked.
    setExternalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    );
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
      {pendingLoginRequest &&
        !hiddenRequests.includes(pendingLoginRequest.requestId) && (
          <div
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              zIndex: 1300,
              width: 360,
              background: "#fff",
              border: "2px solid #0F172A",
              boxShadow: "6px 6px 0px #0F172A",
              padding: 12,
            }}
          >
            <div
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              New Login Request
            </div>
            <div style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>
              Device: {pendingLoginRequest.deviceInfo}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-secondary btn-sm"
                onClick={() =>
                  resolvePendingLoginRequest(
                    pendingLoginRequest.requestId,
                    "deny",
                  )
                }
              >
                Keep This Device
              </button>
              <button
                className="btn-primary btn-sm"
                onClick={() =>
                  resolvePendingLoginRequest(
                    pendingLoginRequest.requestId,
                    "approve",
                  )
                }
              >
                Allow Other Device
              </button>
            </div>
          </div>
        )}

      {/* ── Top Bar ── */}
      <header className="editor-topbar">
        <button className="btn-ghost btn-sm editor-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="editor-divider" />

        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: "#3B6978" }}
        >
          description
        </span>

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

        <div style={{ position: "relative" }}>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setNotificationsOpen((s) => !s)}
            style={{ marginRight: 8 }}
          >
            Notifications{" "}
            {hiddenRequests.length > 0 ? `(${hiddenRequests.length})` : ""}
          </button>
          {notificationsOpen && (
            <div
              ref={notificationsRef}
              style={{
                position: "absolute",
                right: 0,
                top: 36,
                width: 360,
                background: "#fff",
                border: "2px solid #0F172A",
                boxShadow: "6px 6px 0px #0F172A",
                padding: 12,
                zIndex: 1400,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Hidden Requests
              </div>
              {hiddenRequests.length === 0 && (
                <div style={{ color: "#475569" }}>No hidden requests</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingLoginRequest &&
                  hiddenRequests.includes(pendingLoginRequest.requestId) && (
                    <div
                      style={{ borderTop: "1px solid #E2E8F0", paddingTop: 8 }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {pendingLoginRequest.deviceInfo}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            resolvePendingLoginRequest(
                              pendingLoginRequest.requestId,
                              "deny",
                            );
                            setHiddenRequests((h) =>
                              h.filter(
                                (id) => id !== pendingLoginRequest.requestId,
                              ),
                            );
                            setNotificationsOpen(false);
                          }}
                        >
                          Keep This Device
                        </button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => {
                            resolvePendingLoginRequest(
                              pendingLoginRequest.requestId,
                              "approve",
                            );
                            setHiddenRequests((h) =>
                              h.filter(
                                (id) => id !== pendingLoginRequest.requestId,
                              ),
                            );
                            setNotificationsOpen(false);
                          }}
                        >
                          Allow Other Device
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setHiddenRequests((h) =>
                              h.filter(
                                (id) => id !== pendingLoginRequest.requestId,
                              ),
                            );
                          }}
                        >
                          Mute
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

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
        <Toolbar
          editor={editorRef.current}
          onAddTask={handleAddExternalTask}
          tasksPanelOpen={tasksPanelOpen}
          onToggleTasksPanel={() => setTasksPanelOpen((v) => !v)}
        />
      )}

      {/* ── Main Layout ── */}
      <div className="editor-main-layout">
        <div className="editor-main-area">
          <div className="editor-content-row">
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

                {/* FIX: Key on ydoc identity so CollabEditor fully remounts
                    when a new ydoc is created for a new docId. This ensures
                    the Tiptap Collaboration extension always binds to the
                    current ydoc instance, not a stale one. */}
                {ydocReady && (
                  <CollabEditor
                    key={ydoc.guid}
                    ydoc={ydoc}
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
