import React, { useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";

const MIN_WIDTH = 100;
const MAX_WIDTH = 650;
const DEFAULT_WIDTH = 250;

export default function ResizableImageView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Get current width from node attributes
  const currentWidth = node.attrs.width
    ? parseInt(String(node.attrs.width), 10)
    : DEFAULT_WIDTH;

  const handleRightEdgeResize = (e: React.PointerEvent) => {
    if (!editor.isEditable) return;

    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    // Capture the pointer on the handle itself so fast drags (and touch)
    // can't slip off it and lose the resize gesture mid-drag.
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startWidth = currentWidth;
    let lastSyncedWidth = startWidth;
    let lastSyncTime = 0;

    const applyWidth = (newWidth: number, live: boolean) => {
      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
      }
      // Push lightweight updates during the drag (throttled) so collaborators
      // see the resize happen live instead of only after mouse-up.
      if (live) {
        const now = performance.now();
        if (now - lastSyncTime > 80) {
          updateAttributes({ width: String(newWidth) });
          lastSyncTime = now;
          lastSyncedWidth = newWidth;
        }
      }
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth + delta),
      );
      applyWidth(newWidth, true);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      const finalWidth = containerRef.current
        ? containerRef.current.offsetWidth
        : lastSyncedWidth;

      // Always send a final authoritative update, in case the throttle
      // skipped the very last movement.
      updateAttributes({ width: String(finalWidth) });

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      if (containerRef.current) {
        containerRef.current.style.width = "";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`image-container ${selected ? "selected" : ""}`}
      data-drag-handle={false}
      style={{ width: `${currentWidth}px` }}
      ref={containerRef}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        title={node.attrs.title || ""}
        draggable={false}
      />
      {selected && editor.isEditable && (
        <>
          {/* Full-height invisible strip: forgiving hit-area along the edge */}
          <div
            className="image-resize-edge"
            onPointerDown={handleRightEdgeResize}
          />
          {/* Visible corner dot: the actual affordance the user sees */}
          <div
            className="image-resize-handle"
            onPointerDown={handleRightEdgeResize}
          />
        </>
      )}
    </NodeViewWrapper>
  );
}
