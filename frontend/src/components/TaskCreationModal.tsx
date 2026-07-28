import React, { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  initialValue?: string;
  onClose: () => void;
  onSubmit: (taskText: string) => void;
}

export default function TaskCreationModal({
  open,
  initialValue = "",
  onClose,
  onSubmit,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, initialValue]);

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
  }, [open, value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter a task description.");
      return;
    }
    onSubmit(trimmed);
  };

  if (!open) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div
        className="task-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <div className="task-modal-header">
          <div id="task-modal-title" className="task-modal-title">
            Create Task
          </div>
        </div>

        <div className="task-modal-body">
          <label className="task-modal-label" htmlFor="task-modal-input">
            Task description
          </label>
          <input
            id="task-modal-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            className="task-modal-input"
            placeholder="Enter a short task description"
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
          <button type="button" className="btn-primary btn-sm" onClick={submit}>
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}
