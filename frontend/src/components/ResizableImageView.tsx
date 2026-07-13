import React, { useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";

const MIN_WIDTH = 100;
// Fallback only, used if we can't measure the real container (shouldn't
// normally happen). The actual max is computed live from the DOM below,
// so "full size" always means the true edge of the content column.
const MAX_WIDTH_FALLBACK = 900;
const DEFAULT_WIDTH = 250;

// How wide the image is allowed to grow: the content width of the
// nearest parent element, i.e. the actual edge of the page/column —
// not an arbitrary constant. This is what makes "resize to full width"
// possible and keeps it correct across different screen sizes.
function getMaxAvailableWidth(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent) return MAX_WIDTH_FALLBACK;
  const style = window.getComputedStyle(parent);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const available = parent.clientWidth - paddingLeft - paddingRight;
  return available > 0 ? available : MAX_WIDTH_FALLBACK;
}

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
    const maxWidth = containerRef.current
      ? getMaxAvailableWidth(containerRef.current)
      : MAX_WIDTH_FALLBACK;
    let pendingWidth = startWidth;
    let rafId: number | null = null;

    // IMPORTANT: during the drag we only apply a CSS `transform: scale()`.
    // That's compositor-only (no layout/reflow), so it stays smooth no
    // matter how large the image is. We previously called updateAttributes
    // on a timer during the drag for live collaborator sync, but that fires
    // a real ProseMirror/Yjs transaction — which re-flows the surrounding
    // page — and that cost grows with the image's size, causing stutter
    // as you resize toward the larger end of the range. So now the only
    // real (layout-triggering) update happens once, on release.
    const applyFrame = () => {
      rafId = null;
      if (!containerRef.current) return;
      const scale = pendingWidth / startWidth;
      containerRef.current.style.transform = `scale(${scale})`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      pendingWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, startWidth + delta));
      // Coalesce to one DOM touch per frame even if pointermove fires faster.
      if (rafId === null) {
        rafId = requestAnimationFrame(applyFrame);
      }
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const finalWidth = Math.round(pendingWidth);
      updateAttributes({ width: String(finalWidth) });

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      if (containerRef.current) {
        containerRef.current.style.transform = "";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`image-container ${selected ? "selected" : ""} ${isResizing ? "is-resizing" : ""}`}
      data-drag-handle={false}
      style={{ width: `${currentWidth}px`, transformOrigin: "top left" }}
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
