import React, { useEffect, useState, useCallback } from "react";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { Document, PendingInvitation } from "../types";

interface Props {
  onOpenDoc: (docId: string) => void;
}

export default function Dashboard({ onOpenDoc }: Props) {
  const { user, logout } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [invResp, setInvResp] = useState<{ [k: string]: "loading" | null }>({});
  const [copied, setCopied] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [docsRes, invRes] = await Promise.all([
        api.get("/documents"),
        api.get("/documents/invitations/me"),
      ]);
      setDocs(docsRes.data);
      setInvitations(invRes.data);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        logout();
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post("/documents", {
        title: newTitle || "Untitled Document",
      });
      setDocs((d) => [data, ...d]);
      setNewTitle("");
      setShowCreate(false);
      onOpenDoc(data.docId);
    } catch {
      alert("Failed to create document");
    } finally {
      setCreating(false);
    }
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await api.delete(`/documents/${docId}`);
      setDocs((d) => d.filter((doc) => doc.docId !== docId));
    } catch {
      alert("Failed to delete document");
    }
  };

  const respondInvitation = async (
    docId: string,
    action: "accept" | "reject",
  ) => {
    setInvResp((r) => ({ ...r, [docId]: "loading" }));
    try {
      await api.post(`/documents/${docId}/invitations/respond`, { action });
      setInvitations((i) => i.filter((inv) => inv.docId !== docId));
      if (action === "accept") fetchAll();
    } catch {
      alert("Failed to respond to invitation");
    } finally {
      setInvResp((r) => ({ ...r, [docId]: null }));
    }
  };

  const copyCollabId = () => {
    navigator.clipboard.writeText(user?.collabId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const ownDocs = docs.filter((d) => d.ownerUsername === user?.username);
  const sharedDocs = docs.filter((d) => d.ownerUsername !== user?.username);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F4FAFD",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Sidebar + Main Layout ── */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          minHeight: "100vh",
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: 240,
            flexShrink: 0,
            background: "#F4FAFD",
            borderRight: "2px solid #0F172A",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            position: "sticky",
            top: 0,
          }}
        >
          {/* Brand */}
          <div style={{ padding: "24px 20px 20px" }}>
            <div
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#0F172A",
                letterSpacing: "-0.01em",
              }}
            >
              CollabEdit
            </div>
            <div
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "#94A3B8",
                marginTop: 2,
              }}
            >
              {user?.username} · Lead Editor
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "0 12px" }}></nav>

          {/* Bottom */}
          <div style={{ padding: "16px 12px", borderTop: "2px solid #0F172A" }}>
            {/* CollabID */}
            <div
              style={{
                background: "#EEF5F8",
                border: "2px solid #0F172A",
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              <div className="section-heading" style={{ marginBottom: 4 }}>
                Your CollabID
              </div>
              <div
                style={{
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#21515F",
                  wordBreak: "break-all",
                  marginBottom: 8,
                }}
              >
                {user?.collabId}
              </div>
              <button
                className="btn-secondary btn-sm"
                onClick={copyCollabId}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {copied ? "✓ Copied" : "Copy ID"}
              </button>
            </div>

            {/* New Document */}
            <button
              className="btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                marginBottom: 10,
              }}
              onClick={() => setShowCreate(true)}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                add
              </span>
              New Document
            </button>

            {/* Logout */}
            <button
              className="btn-ghost btn-sm"
              onClick={logout}
              style={{ width: "100%", justifyContent: "center" }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14 }}
              >
                logout
              </span>
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto", paddingBottom: 40 }}>
          {/* Top header */}
          <div
            style={{
              background: "#F4FAFD",
              borderBottom: "2px solid #0F172A",
              padding: "0 32px",
              height: 64,
              display: "flex",
              alignItems: "center",
              gap: 16,
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <h1
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 22,
                fontWeight: 700,
                color: "#0F172A",
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}
            >
              The Archive
            </h1>
            <div style={{ flex: 1 }} />
          </div>

          <div style={{ padding: "32px" }}>
            {/* Page title */}
            <div style={{ marginBottom: 32 }}>
              <h2
                style={{
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 36,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: "#0F172A",
                }}
              >
                Document
                <br />
                <span
                  style={{
                    color: "#3B6978",
                    fontStyle: "italic",
                    textDecoration: "underline",
                    textDecorationThickness: 3,
                    textUnderlineOffset: 6,
                  }}
                >
                  Management
                </span>
              </h2>
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  color: "#475569",
                  marginTop: 10,
                  maxWidth: 480,
                }}
              >
                Manage your documents, collaborate in real-time, and oversee
                access permissions across your team.
              </p>
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <span className="section-heading">Pending Invitations</span>
                  <div
                    style={{
                      background: "#D97706",
                      color: "#fff",
                      fontFamily: "Space Grotesk, sans-serif",
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      border: "1px solid #0F172A",
                    }}
                  >
                    {invitations.length} new
                  </div>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {invitations.map((inv) => (
                    <div
                      key={inv.docId}
                      style={{
                        background: "#FFFBEB",
                        border: "2px solid #0F172A",
                        boxShadow: "3px 3px 0px #0F172A",
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ color: "#D97706", fontSize: 22 }}
                      >
                        mail
                      </span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: "Space Grotesk, sans-serif",
                            fontWeight: 700,
                            fontSize: 14,
                            color: "#0F172A",
                          }}
                        >
                          {inv.title}
                        </div>
                        <div
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: 12,
                            color: "#475569",
                            marginTop: 2,
                          }}
                        >
                          Invited by <strong>{inv.ownerUsername}</strong> ·{" "}
                          {inv.accessLevel} access
                        </div>
                      </div>
                      <button
                        className="btn-primary btn-sm"
                        disabled={invResp[inv.docId] === "loading"}
                        onClick={() => respondInvitation(inv.docId, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={invResp[inv.docId] === "loading"}
                        onClick={() => respondInvitation(inv.docId, "reject")}
                      >
                        Decline
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* New Document form */}
            {showCreate && (
              <div
                style={{
                  background: "#EEF5F8",
                  border: "2px solid #0F172A",
                  boxShadow: "4px 4px 0px #0F172A",
                  padding: "20px",
                  marginBottom: 24,
                }}
              >
                <div className="section-heading" style={{ marginBottom: 12 }}>
                  Create New Document
                </div>
                <form onSubmit={createDoc} style={{ display: "flex", gap: 10 }}>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Document title…"
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="btn-primary btn-sm"
                    disabled={creating}
                  >
                    {creating ? "…" : "Create →"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </button>
                </form>
              </div>
            )}

            {/* My Documents */}
            <section style={{ marginBottom: 40 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="section-heading">My Documents</span>
                  {!loading && (
                    <span
                      className="section-heading"
                      style={{ color: "#3B6978" }}
                    >
                      {ownDocs.length} entries
                    </span>
                  )}
                </div>
                {!showCreate && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setShowCreate(true)}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14 }}
                    >
                      add
                    </span>
                    New
                  </button>
                )}
              </div>

              {loading ? (
                <div
                  style={{
                    border: "2px solid #0F172A",
                    padding: "40px",
                    textAlign: "center",
                    fontFamily: "Space Grotesk, sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#94A3B8",
                  }}
                >
                  Loading Archive…
                </div>
              ) : ownDocs.length === 0 ? (
                <div
                  style={{
                    border: "2px dashed #CBD5E1",
                    padding: "48px 20px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "Space Grotesk, sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#94A3B8",
                      marginBottom: 8,
                    }}
                  >
                    No Documents Yet
                  </div>
                  <div
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 12,
                      color: "#CBD5E1",
                    }}
                  >
                    Create your first document to get started
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 14,
                  }}
                >
                  {ownDocs.map((doc) => (
                    <DocCard
                      key={doc.docId}
                      doc={doc}
                      isOwner
                      onOpen={() => onOpenDoc(doc.docId)}
                      onDelete={() => deleteDoc(doc.docId)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Shared With Me */}
            {sharedDocs.length > 0 && (
              <section>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <span className="section-heading">Shared With Me</span>
                  <span
                    className="section-heading"
                    style={{ color: "#3B6978" }}
                  >
                    {sharedDocs.length} entries
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 14,
                  }}
                >
                  {sharedDocs.map((doc) => (
                    <DocCard
                      key={doc.docId}
                      doc={doc}
                      isOwner={false}
                      onOpen={() => onOpenDoc(doc.docId)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function DocCard({
  doc,
  isOwner,
  onOpen,
  onDelete,
}: {
  doc: Document;
  isOwner: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const updated = new Date(doc.updatedAt || doc.createdAt);
  const timeStr = updated.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      style={{
        background: "#fff",
        border: "2px solid #0F172A",
        boxShadow: "4px 4px 0px #0F172A",
        padding: "20px",
        cursor: "pointer",
        transition: "all 0.1s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform =
          "translate(-2px, -2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "6px 6px 0px #0F172A";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "none";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "4px 4px 0px #0F172A";
      }}
      onClick={onOpen}
    >
      {/* Doc header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            background: isOwner ? "#21515F" : "#EEF5F8",
            border: "2px solid #0F172A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: isOwner ? "#fff" : "#3B6978" }}
          >
            description
          </span>
        </div>
        <span
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "2px 8px",
            background: isOwner ? "#EEF5F8" : "#F1F5F9",
            border: "1px solid #0F172A",
            color: isOwner ? "#21515F" : "#475569",
          }}
        >
          {isOwner ? "Owner" : "Collab"}
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 15,
          fontWeight: 700,
          color: "#0F172A",
          marginBottom: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          letterSpacing: "-0.01em",
        }}
      >
        {doc.title}
      </div>

      {/* Meta */}
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          color: "#94A3B8",
          marginBottom: 14,
        }}
      >
        {isOwner
          ? `${doc.collaborators?.length || 0} collaborator${doc.collaborators?.length !== 1 ? "s" : ""}`
          : `by ${doc.ownerUsername}`}{" "}
        · {timeStr}
      </div>

      {/* Actions */}
      {isOwner && onDelete && (
        <div
          style={{
            borderTop: "1px solid #E2E8F0",
            paddingTop: 12,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            className="btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{ color: "#DC2626", fontSize: 10 }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
