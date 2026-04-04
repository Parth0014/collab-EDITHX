import React, { useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { api, API_BASE } from "../utils/api";
import { Document, MediaAsset } from "../types";
import "./MediaPanel.css";

interface Props {
  doc: Document;
  docId: string;
  canEdit: boolean;
  isOwner: boolean;
  socket: Socket | null;
  onDocUpdate: (doc: Document) => void;
  onClose: () => void;
  onInsertImage: (url: string, name: string) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, "");

function resolveMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${BACKEND_ORIGIN}${url}`;
  return `${BACKEND_ORIGIN}/${url}`;
}

export default function MediaPanel({
  doc,
  docId,
  canEdit,
  isOwner,
  socket,
  onDocUpdate,
  onClose,
  onInsertImage,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const upload = async (file: File) => {
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post(`/media/${docId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newAsset: MediaAsset = data.asset;
      onDocUpdate({
        ...doc,
        mediaAssets: [...(doc.mediaAssets || []), newAsset],
      });
      socket?.emit("media-added", { docId, asset: newAsset });
      setUploadProgress("");
    } catch (err: any) {
      setUploadProgress(
        "Upload failed: " + (err.response?.data?.error || err.message),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(upload);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach(upload);
  };

  const deleteAsset = async (assetId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await api.delete(`/media/${docId}/${assetId}`);
      onDocUpdate({
        ...doc,
        mediaAssets: (doc.mediaAssets || []).filter((a) => a.id !== assetId),
      });
    } catch {
      alert("Failed to delete");
    }
  };

  const images = (doc.mediaAssets || []).filter((a) => a.type === "image");
  const pdfs = (doc.mediaAssets || []).filter((a) => a.type === "pdf");

  return (
    <aside className="media-panel">
      {/* Header */}
      <div className="media-panel-header">
        <span className="media-panel-title">📎 Media</span>
        <button
          className="btn-ghost btn-sm media-panel-close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="media-panel-body">
        {/* Upload zone */}
        {canEdit && (
          <div
            className={`media-upload-zone ${uploading ? "media-uploading" : ""}`}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInput.current?.click()}
          >
            <div className="media-upload-icon">{uploading ? "⏳" : "📤"}</div>
            <div className="media-upload-text">
              {uploading ? uploadProgress : "Drop files or click to upload"}
            </div>
            <div className="media-upload-help">
              Images (JPEG, PNG, GIF, WEBP) and PDFs · Max 20MB
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,.pdf"
              aria-label="Upload media files"
              title="Upload media files"
              className="media-upload-input"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className="media-section">
            <div className="media-section-title">Images ({images.length})</div>
            <div className="media-grid">
              {images.map((asset) => (
                <div key={asset.id} className="media-card">
                  <img
                    src={resolveMediaUrl(asset.url)}
                    alt={asset.originalName}
                    className="media-thumb"
                    onClick={() =>
                      onInsertImage(
                        resolveMediaUrl(asset.url),
                        asset.originalName,
                      )
                    }
                    title="Click to insert into document"
                  />
                  <div className="media-card-meta">
                    <span className="media-card-name">
                      {asset.originalName}
                    </span>
                    {isOwner && (
                      <button
                        className="btn-ghost btn-sm media-delete-btn"
                        onClick={() => deleteAsset(asset.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="media-insert-badge">Click to insert</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PDFs */}
        {pdfs.length > 0 && (
          <div>
            <div className="media-section-title">PDFs ({pdfs.length})</div>
            {pdfs.map((asset) => (
              <PdfWidget
                key={asset.id}
                asset={asset}
                isOwner={isOwner}
                onDelete={() => deleteAsset(asset.id)}
              />
            ))}
          </div>
        )}

        {images.length === 0 && pdfs.length === 0 && !canEdit && (
          <div className="media-empty-state">
            No media files in this document.
          </div>
        )}
      </div>
    </aside>
  );
}

function PdfWidget({
  asset,
  isOwner,
  onDelete,
}: {
  asset: MediaAsset;
  isOwner: boolean;
  onDelete: () => void;
}) {
  const fullUrl = resolveMediaUrl(asset.url);
  return (
    <div className="pdf-widget">
      {/* PDF preview area */}
      <div className="pdf-preview">
        <div className="pdf-icon">📄</div>
        <div className="pdf-name">{asset.originalName}</div>
        <div className="pdf-size">PDF · {formatSize(asset.size)}</div>
      </div>

      {/* Actions bar */}
      <div className="pdf-actions">
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pdf-link-main"
        >
          <button className="btn-primary btn-sm pdf-view-btn">
            View PDF ↗
          </button>
        </a>
        <a
          href={fullUrl}
          download={asset.originalName}
          className="pdf-link-inline"
        >
          <button
            className="btn-secondary btn-sm pdf-icon-btn"
            title="Download"
          >
            ⬇
          </button>
        </a>
        {isOwner && (
          <button
            className="btn-danger btn-sm pdf-icon-btn"
            onClick={onDelete}
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
