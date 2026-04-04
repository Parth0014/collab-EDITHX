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

  const handleRightEdgeResize = (e: React.MouseEvent) => {
    if (!editor.isEditable) return;

    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = currentWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth + delta),
      );

      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      const newWidth = containerRef.current
        ? containerRef.current.offsetWidth
        : currentWidth;

      updateAttributes({ width: String(newWidth) });

      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (containerRef.current) {
        containerRef.current.style.width = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
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
        <div
          className="image-resize-handle"
          onMouseDown={handleRightEdgeResize}
        />
      )}
    </NodeViewWrapper>
  );
}
