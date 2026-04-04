import React from "react";
import { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

const sep = (
  <div
    style={{
      width: 1,
      height: 20,
      background: "var(--border)",
      margin: "0 4px",
    }}
  />
);

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        padding: "5px 8px",
        borderRadius: 5,
        fontSize: 13,
        fontWeight: 500,
        background: active ? "var(--accent-light)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        minWidth: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

export default function Toolbar({ editor }: Props) {
  if (!editor) return null;

  const lastSelectionRef = React.useRef<{ from: number; to: number } | null>(
    null,
  );

  React.useEffect(() => {
    const syncSelection = () => {
      const { from, to } = editor.state.selection;
      lastSelectionRef.current = { from, to };
    };

    syncSelection();
    editor.on("selectionUpdate", syncSelection);

    return () => {
      editor.off("selectionUpdate", syncSelection);
    };
  }, [editor]);

  const setFontSize = (fontSize: string) => {
    const chain = editor.chain();
    const lastSelection = lastSelectionRef.current;

    if (lastSelection) {
      chain.setTextSelection(lastSelection);
    }

    chain.focus();

    const attrs = editor.getAttributes("textStyle") || {};
    if (fontSize === "16px") {
      const { fontSize: _ignored, ...rest } = attrs;
      if (Object.keys(rest).length === 0) {
        chain.unsetMark("textStyle").run();
      } else {
        chain.setMark("textStyle", rest).run();
      }
      return;
    }

    chain.setMark("textStyle", { ...attrs, fontSize }).run();
  };

  const addLink = () => {
    const url = prompt("Enter URL:");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  const resizeSelectedImage = (delta: number) => {
    const { selection } = editor.state;
    const selectedNode = (selection as any).node;
    const node =
      selectedNode?.type?.name === "image"
        ? selectedNode
        : selection.$from.nodeAfter;

    if (!node || node.type.name !== "image") {
      return;
    }

    const currentWidth = Number.parseInt(String(node.attrs.width || "400"), 10);
    const nextWidth = Math.max(80, Math.min(1200, currentWidth + delta));

    editor
      .chain()
      .focus()
      .updateAttributes("image", { width: `${nextWidth}px` })
      .run();
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "4px 16px",
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      {/* Headings */}
      <ToolBtn
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolBtn>
      <ToolBtn
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolBtn>
      <ToolBtn
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolBtn>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Size:</span>
        <select
          title="Text size"
          aria-label="Text size"
          value={editor.getAttributes("textStyle")?.fontSize || "16px"}
          onMouseDown={() => {
            const { from, to } = editor.state.selection;
            lastSelectionRef.current = { from, to };
          }}
          onChange={(e) => setFontSize(e.target.value)}
          style={{
            height: 24,
            fontSize: 11,
            padding: "0 6px",
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--surface)",
          }}
        >
          <option value="16px">Body</option>
          <option value="18px">Large</option>
          <option value="22px">XL</option>
          <option value="28px">XXL</option>
        </select>
      </div>

      {sep}

      {/* Text format */}
      <ToolBtn
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolBtn>
      <ToolBtn
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: "underline" }}>U</span>
      </ToolBtn>
      <ToolBtn
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span style={{ textDecoration: "line-through" }}>S</span>
      </ToolBtn>
      <ToolBtn
        title="Highlight"
        active={editor.isActive("highlight")}
        onClick={() =>
          editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()
        }
      >
        🖊
      </ToolBtn>

      {sep}

      {/* Alignment */}
      <ToolBtn
        title="Align Left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        ≡
      </ToolBtn>
      <ToolBtn
        title="Align Center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        ≡
      </ToolBtn>
      <ToolBtn
        title="Align Right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        ≡
      </ToolBtn>

      {sep}

      {/* Lists */}
      <ToolBtn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolBtn>
      <ToolBtn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolBtn>
      <ToolBtn
        title="Task list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        ☑ Tasks
      </ToolBtn>

      {sep}

      {/* Blocks */}
      <ToolBtn
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        "
      </ToolBtn>
      <ToolBtn
        title="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        {"</>"}
      </ToolBtn>
      <ToolBtn title="Link" active={editor.isActive("link")} onClick={addLink}>
        🔗
      </ToolBtn>
      <ToolBtn
        title="Horizontal rule"
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        —
      </ToolBtn>

      <ToolBtn
        title="Decrease image size"
        active={false}
        onClick={() => resizeSelectedImage(-40)}
      >
        🖼−
      </ToolBtn>
      <ToolBtn
        title="Increase image size"
        active={false}
        onClick={() => resizeSelectedImage(40)}
      >
        🖼+
      </ToolBtn>

      {sep}

      {/* Text color */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Color:</span>
        <input
          type="color"
          defaultValue="#1a1a18"
          title="Text color"
          aria-label="Text color"
          onChange={(e) =>
            editor.chain().focus().setColor(e.target.value).run()
          }
          style={{
            width: 24,
            height: 24,
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        />
      </div>

      {sep}

      {/* Undo/Redo */}
      <ToolBtn
        title="Undo"
        active={false}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↩
      </ToolBtn>
      <ToolBtn
        title="Redo"
        active={false}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↪
      </ToolBtn>
    </div>
  );
}
