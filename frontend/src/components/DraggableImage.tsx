import React, { useState, useRef, useCallback } from 'react';

interface Props {
  src: string;
  alt?: string;
  initialWidth?: number;
}

export default function DraggableImage({ src, alt, initialWidth = 400 }: Props) {
  const [width, setWidth] = useState(initialWidth);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [selected, setSelected] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const resizeStart = useRef({ mx: 0, w: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDownDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
    e.preventDefault();
    setIsDragging(true);
    setSelected(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, px: position.x, py: position.y };

    const onMove = (ev: MouseEvent) => {
      setPosition({
        x: dragStart.current.px + ev.clientX - dragStart.current.mx,
        y: dragStart.current.py + ev.clientY - dragStart.current.my,
      });
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [position]);

  const onMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = { mx: e.clientX, w: width };

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(80, resizeStart.current.w + ev.clientX - resizeStart.current.mx);
      setWidth(newWidth);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: selected ? 10 : 1,
      }}
      onMouseDown={onMouseDownDrag}
      onClick={() => setSelected(true)}
      onBlur={() => setSelected(false)}
      tabIndex={0}
    >
      <img
        src={src}
        alt={alt || ''}
        draggable={false}
        style={{
          width,
          display: 'block',
          borderRadius: 4,
          outline: selected ? '2px solid #4f46e5' : '2px solid transparent',
          outlineOffset: 2,
          transition: 'outline-color 0.1s',
          pointerEvents: 'none',
        }}
      />

      {/* Resize handle (bottom-right) */}
      {selected && (
        <div
          className="resize-handle"
          onMouseDown={onMouseDownResize}
          style={{
            position: 'absolute', bottom: -5, right: -5,
            width: 14, height: 14, background: '#4f46e5', borderRadius: '50%',
            cursor: 'se-resize', zIndex: 20, border: '2px solid #fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      )}

      {/* Crop indicator overlay (just shows selection) */}
      {selected && (
        <div style={{
          position: 'absolute', top: 4, left: 4,
          background: 'rgba(79,70,229,0.85)', color: '#fff',
          fontSize: 10, padding: '2px 6px', borderRadius: 4,
          pointerEvents: 'none',
        }}>
          {Math.round(width)}px · drag to move · corner to resize
        </div>
      )}
    </div>
  );
}
