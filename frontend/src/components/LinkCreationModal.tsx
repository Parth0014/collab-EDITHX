import React, { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  initialText?: string;
  initialUrl?: string;
  onClose: () => void;
  onSubmit: (linkText: string, url: string) => void;
  onUnlink?: () => void;
}

export default function LinkCreationModal({
  open,
  initialText = "",
  initialUrl = "",
  onClose,
  onSubmit,
  onUnlink,
}: Props) {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const textRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setUrl(initialUrl);
      setError("");
      window.setTimeout(() => textRef.current?.focus(), 0);
    }
  }, [open, initialText, initialUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, text, url]);

  const isEdit = Boolean(initialUrl);

  const submit = () => {
    const trimmedText = text.trim();
    const trimmedUrl = url.trim();
    if (!trimmedText) {
      setError("Please enter link text.");
      return;
    }
    if (!trimmedUrl) {
      setError("Please enter a URL.");
      return;
    }
    onSubmit(trimmedText, trimmedUrl);
  };

  const unlink = () => {
    onUnlink?.();
  };

  if (!open) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div
        className="task-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-modal-title"
      >
        <div className="task-modal-header">
          <div id="link-modal-title" className="task-modal-title">
            {isEdit ? "Edit link" : "Add link"}
          </div>
        </div>

        <div className="task-modal-body">
          <label className="task-modal-label" htmlFor="link-text-input">
            Link text
          </label>
          <input
            id="link-text-input"
            ref={textRef}
            type="text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            className="task-modal-input"
            placeholder="Enter the text to display"
          />

          <label className="task-modal-label" htmlFor="link-url-input">
            URL
          </label>
          <input
            id="link-url-input"
            type="text"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            className="task-modal-input"
            placeholder="https://example.com"
          />

          {error && <div className="task-modal-error">{error}</div>}
        </div>

        <div className="task-modal-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          {isEdit && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={unlink}
            >
              Unlink
            </button>
          )}
          <button type="button" className="btn-primary btn-sm" onClick={submit}>
            {isEdit ? "Save link" : "Add link"}
          </button>
        </div>
      </div>
    </div>
  );
}
