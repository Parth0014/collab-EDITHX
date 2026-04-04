import React, { useState } from "react";
import { Socket } from "socket.io-client";
import { api } from "../utils/api";
import { Document, Collaborator } from "../types";

interface Props {
  doc: Document;
  isOwner: boolean;
  socket: Socket | null;
  onClose: () => void;
  onDocUpdate: (doc: Document) => void;
  currentUserId?: string;
}

export default function MembersPanel({
  doc,
  isOwner,
  socket,
  onClose,
  onDocUpdate,
  currentUserId,
}: Props) {
  const [inviteId, setInviteId] = useState("");
  const [inviteAccess, setInviteAccess] = useState<"edit" | "view">("edit");
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [inviteMsg, setInviteMsg] = useState("");

  const sendInvite = async () => {
    if (!inviteId.trim()) return;
    setInviteStatus("loading");
    try {
      const { data } = await api.post(`/documents/${doc.docId}/invite`, {
        collabId: inviteId.trim(),
        accessLevel: inviteAccess,
      });
      setInviteMsg(data.message || "Invitation sent!");
      setInviteStatus("success");
      setInviteId("");
    } catch (err: any) {
      setInviteMsg(err.response?.data?.error || "Failed to send invitation");
      setInviteStatus("error");
    }
  };

  const changeAccess = async (
    collab: Collaborator,
    newLevel: "view" | "edit",
  ) => {
    try {
      await api.put(
        `/documents/${doc.docId}/collaborators/${collab.collabId}/access`,
        {
          accessLevel: newLevel,
        },
      );
      socket?.emit("access-changed", {
        docId: doc.docId,
        collabId: collab.collabId,
        accessLevel: newLevel,
      });
      onDocUpdate({
        ...doc,
        collaborators: doc.collaborators.map((c) =>
          c.collabId === collab.collabId ? { ...c, accessLevel: newLevel } : c,
        ),
      });
    } catch {
      alert("Failed to change access");
    }
  };

  const revokeAccess = async (collab: Collaborator) => {
    const isRemovingSelf = currentUserId === collab.collabId;
    const message = isRemovingSelf
      ? "Are you sure you want to leave this document?"
      : `Remove ${collab.username} from this document?`;

    if (!confirm(message)) return;

    try {
      await api.delete(
        `/documents/${doc.docId}/collaborators/${collab.collabId}`,
      );
      socket?.emit("access-revoked", {
        docId: doc.docId,
        collabId: collab.collabId,
      });

      // Defer state update to avoid lifecycle conflicts
      setTimeout(() => {
        onDocUpdate({
          ...doc,
          collaborators: doc.collaborators.filter(
            (c) => c.collabId !== collab.collabId,
          ),
        });
      }, 0);
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to remove access";
      alert(msg);
    }
  };

  const pendingInvites =
    doc.invitations?.filter((i) => i.status === "pending") || [];

  return (
    <aside
      style={{
        width: 300,
        flexShrink: 0,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>👥 Members</span>
        <button
          className="btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Owner */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            Owner
          </div>
          <MemberRow
            name={doc.ownerUsername}
            badge="owner"
            badgeColor="var(--accent)"
          />
        </div>

        {/* Collaborators */}
        {doc.collaborators?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              Collaborators ({doc.collaborators.length})
            </div>
            {doc.collaborators.map((c) => (
              <div
                key={c.collabId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {c.username[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.username}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.collabId}
                  </div>
                </div>
                {isOwner ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <select
                      title="Change collaborator access level"
                      value={c.accessLevel}
                      onChange={(e) =>
                        changeAccess(c, e.target.value as "view" | "edit")
                      }
                      style={{ fontSize: 11, padding: "2px 4px", height: 24 }}
                    >
                      <option value="edit">Edit</option>
                      <option value="view">View</option>
                    </select>
                    <button
                      className="btn-danger btn-sm"
                      style={{ padding: "3px 7px", fontSize: 11 }}
                      onClick={() => revokeAccess(c)}
                      title="Revoke access"
                    >
                      ✕
                    </button>
                  </div>
                ) : currentUserId === c.collabId ? (
                  <button
                    className="btn-danger btn-sm"
                    style={{ padding: "3px 7px", fontSize: 11 }}
                    onClick={() => revokeAccess(c)}
                    title="Leave this document"
                  >
                    Leave
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: "var(--bg)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {c.accessLevel}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pending invitations */}
        {pendingInvites.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              Pending Invitations
            </div>
            {pendingInvites.map((inv, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  padding: "6px 10px",
                  background: "var(--warning-light)",
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {inv.inviteeCollabId}
                </span>
                <span style={{ fontSize: 11, color: "var(--warning)" }}>
                  Pending
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Invite section (owner only) */}
        {isOwner && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "14px",
              background: "var(--bg)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
              Invite by CollabID
            </div>
            <input
              value={inviteId}
              onChange={(e) => setInviteId(e.target.value)}
              placeholder="e.g. alice-a1b2c3"
              style={{ width: "100%", marginBottom: 8, fontSize: 13 }}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Access:
              </label>
              <select
                title="Select invitation access level"
                value={inviteAccess}
                onChange={(e) =>
                  setInviteAccess(e.target.value as "edit" | "view")
                }
                style={{ flex: 1, fontSize: 12 }}
              >
                <option value="edit">Can edit</option>
                <option value="view">Can view</option>
              </select>
            </div>
            <button
              className="btn-primary btn-sm"
              style={{ width: "100%" }}
              disabled={inviteStatus === "loading"}
              onClick={sendInvite}
            >
              {inviteStatus === "loading" ? "Sending…" : "Send Invitation"}
            </button>
            {inviteMsg && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 5,
                  background:
                    inviteStatus === "success"
                      ? "var(--success-light)"
                      : "var(--danger-light)",
                  color:
                    inviteStatus === "success"
                      ? "var(--success)"
                      : "var(--danger)",
                }}
              >
                {inviteMsg}
              </div>
            )}
          </div>
        )}

        {/* Your CollabID reminder */}
        <div
          style={{
            marginTop: 16,
            padding: "10px",
            background: "var(--accent-light)",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              marginBottom: 3,
            }}
          >
            Share your CollabID
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Others need your CollabID to invite you to their documents.
          </div>
        </div>
      </div>
    </aside>
  );
}

function MemberRow({
  name,
  badge,
  badgeColor,
}: {
  name: string;
  badge: string;
  badgeColor: string;
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: badgeColor,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {name[0]?.toUpperCase()}
      </div>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{name}</span>
      <span
        style={{
          marginLeft: "auto",
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 4,
          background: "var(--accent-light)",
          color: "var(--accent)",
        }}
      >
        {badge}
      </span>
    </div>
  );
}
