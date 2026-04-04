import React, { useState } from "react";
import { Socket } from "socket.io-client";
import { api } from "../utils/api";
import { Document, Collaborator } from "../types";
import { usePopup } from "../context/PopupContext";

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
  const { showAlert, showConfirm } = usePopup();
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
        { accessLevel: newLevel },
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
      await showAlert("Failed to change access", "Access Update Failed");
    }
  };

  const revokeAccess = async (collab: Collaborator) => {
    const isRemovingSelf = currentUserId === collab.collabId;
    const message = isRemovingSelf
      ? "Leave this document?"
      : `Remove ${collab.username}?`;
    const confirmed = await showConfirm(message, "Confirm Action");
    if (!confirmed) return;
    try {
      await api.delete(
        `/documents/${doc.docId}/collaborators/${collab.collabId}`,
      );
      socket?.emit("access-revoked", {
        docId: doc.docId,
        collabId: collab.collabId,
      });
      setTimeout(() => {
        onDocUpdate({
          ...doc,
          collaborators: doc.collaborators.filter(
            (c) => c.collabId !== collab.collabId,
          ),
        });
      }, 0);
    } catch (err: any) {
      await showAlert(
        err.response?.data?.error || "Failed to remove access",
        "Remove Access Failed",
      );
    }
  };

  const pendingInvites =
    doc.invitations?.filter((i) => i.status === "pending") || [];

  const sectionHeadingStyle = {
    fontFamily: "Space Grotesk, sans-serif",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "#94A3B8",
    marginBottom: 10,
  };

  return (
    <aside
      style={{
        width: 296,
        flexShrink: 0,
        background: "#F4FAFD",
        borderLeft: "2px solid #0F172A",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "2px solid #0F172A",
          background: "#EEF5F8",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, color: "#21515F" }}
        >
          group
        </span>
        <span
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#21515F",
            flex: 1,
          }}
        >
          ACTIVE_ARCHIVISTS.LOG
        </span>
        <span
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#94A3B8",
          }}
        >
          {(doc.collaborators?.length || 0) + 1} entries
        </span>
        <button
          className="btn-ghost btn-sm"
          onClick={onClose}
          style={{ padding: "2px 6px", marginLeft: 4 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {/* Owner */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHeadingStyle}>Owner</div>
          <MemberRow name={doc.ownerUsername} badge="Admin" badgeBg="#3B6978" />
        </div>

        {/* Collaborators */}
        {doc.collaborators?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={sectionHeadingStyle}>
              Collaborators ({doc.collaborators.length})
            </div>
            {doc.collaborators.map((c) => (
              <div
                key={c.collabId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "#fff",
                  border: "2px solid #0F172A",
                  marginBottom: 8,
                  boxShadow: "2px 2px 0px #0F172A",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    background: "#EEF5F8",
                    border: "2px solid #0F172A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Space Grotesk, sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#21515F",
                    flexShrink: 0,
                  }}
                >
                  {c.username[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "Space Grotesk, sans-serif",
                      fontWeight: 700,
                      fontSize: 12,
                      color: "#0F172A",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.username}
                  </div>
                  <div
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 10,
                      color: "#94A3B8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.collabId}
                  </div>
                </div>

                {/* Actions */}
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
                      title="Change access level"
                      value={c.accessLevel}
                      onChange={(e) =>
                        changeAccess(c, e.target.value as "view" | "edit")
                      }
                      style={{
                        fontSize: 10,
                        padding: "2px 4px",
                        height: 22,
                        width: "auto",
                        fontFamily: "Space Grotesk, sans-serif",
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}
                    >
                      <option value="edit">Editor</option>
                      <option value="view">Viewer</option>
                    </select>
                    <button
                      className="btn-danger btn-sm"
                      style={{ padding: "2px 6px", fontSize: 10 }}
                      onClick={() => revokeAccess(c)}
                      title="Revoke access"
                    >
                      ✕
                    </button>
                  </div>
                ) : currentUserId === c.collabId ? (
                  <button
                    className="btn-danger btn-sm"
                    style={{ fontSize: 10 }}
                    onClick={() => revokeAccess(c)}
                  >
                    Leave
                  </button>
                ) : (
                  <span
                    style={{
                      fontFamily: "Space Grotesk, sans-serif",
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      background:
                        c.accessLevel === "edit" ? "#EEF5F8" : "#F1F5F9",
                      border: "1px solid #0F172A",
                      color: c.accessLevel === "edit" ? "#21515F" : "#475569",
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
            <div style={sectionHeadingStyle}>
              Pending ({pendingInvites.length})
            </div>
            {pendingInvites.map((inv, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "#FFFBEB",
                  border: "2px solid #D97706",
                  marginBottom: 6,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, color: "#D97706" }}
                >
                  mail
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11,
                    color: "#0F172A",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {inv.inviteeCollabId}
                </span>
                <span
                  style={{
                    fontFamily: "Space Grotesk, sans-serif",
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#D97706",
                  }}
                >
                  Pending
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Invite section */}
        {isOwner && (
          <div
            style={{
              background: "#EEF5F8",
              border: "2px solid #0F172A",
              boxShadow: "3px 3px 0px #0F172A",
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontWeight: 700,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#21515F",
                marginBottom: 12,
              }}
            >
              Invite by CollabID
            </div>
            <input
              value={inviteId}
              onChange={(e) => setInviteId(e.target.value)}
              placeholder="e.g. alice-a1b2c3"
              style={{ marginBottom: 8 }}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#475569",
                }}
              >
                Access:
              </span>
              <select
                title="Select access level"
                value={inviteAccess}
                onChange={(e) =>
                  setInviteAccess(e.target.value as "edit" | "view")
                }
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: "Space Grotesk, sans-serif",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                <option value="edit">Can Edit</option>
                <option value="view">Can View</option>
              </select>
            </div>
            <button
              className="btn-primary btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={inviteStatus === "loading"}
              onClick={sendInvite}
            >
              {inviteStatus === "loading" ? "Sending…" : "Send Invitation →"}
            </button>
            {inviteMsg && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  background:
                    inviteStatus === "success" ? "#F0FDF4" : "#FEF2F2",
                  border: `2px solid ${inviteStatus === "success" ? "#16A34A" : "#DC2626"}`,
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: inviteStatus === "success" ? "#16A34A" : "#DC2626",
                }}
              >
                {inviteMsg}
              </div>
            )}
          </div>
        )}

        {/* CollabID reminder */}
        <div
          style={{
            padding: "12px 14px",
            background: "#EEF5F8",
            border: "2px solid #3B6978",
          }}
        >
          <div
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#3B6978",
              marginBottom: 4,
            }}
          >
            Share your CollabID
          </div>
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 11,
              color: "#475569",
              lineHeight: 1.5,
            }}
          >
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
  badgeBg,
}: {
  name: string;
  badge: string;
  badgeBg: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "#fff",
        border: "2px solid #0F172A",
        marginBottom: 8,
        boxShadow: "2px 2px 0px #0F172A",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          background: badgeBg,
          border: "2px solid #0F172A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {name[0]?.toUpperCase()}
      </div>
      <span
        style={{
          flex: 1,
          fontFamily: "Space Grotesk, sans-serif",
          fontWeight: 700,
          fontSize: 12,
          color: "#0F172A",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          padding: "2px 8px",
          background: badgeBg,
          color: "#fff",
          border: "1px solid #0F172A",
        }}
      >
        {badge}
      </span>
    </div>
  );
}
