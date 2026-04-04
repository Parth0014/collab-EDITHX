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
      console.error(e);
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
      if (action === "accept") {
        fetchAll();
      }
    } catch {
      alert("Failed to respond to invitation");
    } finally {
      setInvResp((r) => ({ ...r, [docId]: null }));
    }
  };

  const ownDocs = docs.filter((d) => d.ownerUsername === user?.username);
  const sharedDocs = docs.filter((d) => d.ownerUsername !== user?.username);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700 }}>✏️ CollabEdit</span>
        <div style={{ flex: 1 }} />
        {/* CollabID badge */}
        <div
          style={{
            background: "var(--accent-light)",
            color: "var(--accent)",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ opacity: 0.7 }}>Your CollabID:</span>
          <strong style={{ fontFamily: "monospace" }}>{user?.collabId}</strong>
          <button
            onClick={() => navigator.clipboard.writeText(user?.collabId || "")}
            className="btn-ghost btn-sm"
            style={{ padding: "2px 6px", fontSize: 11 }}
          >
            Copy
          </button>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Hi, {user?.username}
        </span>
        <button className="btn-secondary btn-sm" onClick={logout}>
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 12,
              }}
            >
              Pending Invitations
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {invitations.map((inv) => (
                <div
                  key={inv.docId}
                  style={{
                    background: "var(--warning-light)",
                    border: "1px solid #fde68a",
                    borderRadius: "var(--radius)",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {inv.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
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

        {/* My Documents */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              My Documents
            </h2>
            <div style={{ flex: 1 }} />
            <button
              className="btn-primary btn-sm"
              onClick={() => setShowCreate(true)}
            >
              + New Document
            </button>
          </div>

          {showCreate && (
            <form
              onSubmit={createDoc}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "16px",
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
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
                {creating ? "…" : "Create"}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </form>
          )}

          {loading ? (
            <div style={{ color: "var(--text-faint)", padding: "20px 0" }}>
              Loading…
            </div>
          ) : ownDocs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--text-muted)",
                border: "2px dashed var(--border)",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 500 }}>No documents yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Create your first document to get started
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
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
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 16,
              }}
            >
              Shared With Me
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
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
      </main>
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
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 18px",
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "var(--shadow-md)";
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
      }}
      onClick={onOpen}
    >
      <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {doc.title}
      </div>
      <div
        style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}
      >
        {isOwner
          ? `${doc.collaborators?.length || 0} collaborator${doc.collaborators?.length !== 1 ? "s" : ""}`
          : `by ${doc.ownerUsername}`}{" "}
        · {timeStr}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isOwner && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--accent-light)",
              color: "var(--accent)",
              fontWeight: 500,
            }}
          >
            Owner
          </span>
        )}
        {!isOwner && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--bg)",
              color: "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            Collaborator
          </span>
        )}
        {isOwner && onDelete && (
          <button
            className="btn-ghost btn-sm"
            style={{ marginLeft: "auto", fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
