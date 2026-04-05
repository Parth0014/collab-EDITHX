import React from "react";
import { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
  onAddTask?: () => void;
  tasksPanelOpen?: boolean;
  onToggleTasksPanel?: () => void;
}

const Sep = () => (
  <div
    style={{ width: 2, height: 20, background: "#CBD5E1", margin: "0 4px" }}
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
        padding: "4px 8px",
        fontFamily: "Space Grotesk, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        background: active ? "#21515F" : "transparent",
        color: active ? "#fff" : "#475569",
        border: active ? "2px solid #21515F" : "2px solid transparent",
        minWidth: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.1s",
        boxShadow: active ? "2px 2px 0px #0F172A" : "none",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "#EEF5F8";
          (e.currentTarget as HTMLButtonElement).style.color = "#21515F";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "#475569";
        }
      }}
    >
      {children}
    </button>
  );
}

export default function Toolbar({
  editor,
  onAddTask,
  tasksPanelOpen,
  onToggleTasksPanel,
}: Props) {
  if (!editor) return null;

  const [, forceToolbarRefresh] = React.useReducer((n) => n + 1, 0);

  const toAbsoluteUrl = (rawUrl: string) => {
    const value = rawUrl.trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    return `https://${value}`;
  };

  const [currentFontSize, setCurrentFontSize] = React.useState<string>("19px");
  const lastSelectionRef = React.useRef<{ from: number; to: number } | null>(
    null,
  );

  React.useEffect(() => {
    const syncSelection = () => {
      const { from, to } = editor.state.selection;
      lastSelectionRef.current = { from, to };
      forceToolbarRefresh();
    };
    syncSelection();

    const onEditorUpdate = () => {
      forceToolbarRefresh();
    };

    editor.on("selectionUpdate", syncSelection);
    editor.on("transaction", onEditorUpdate);
    editor.on("focus", onEditorUpdate);
    editor.on("blur", onEditorUpdate);

    return () => {
      editor.off("selectionUpdate", syncSelection);
      editor.off("transaction", onEditorUpdate);
      editor.off("focus", onEditorUpdate);
      editor.off("blur", onEditorUpdate);
    };
  }, [editor]);

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = e.target.value;
    setCurrentFontSize(newSize);

    const chain = editor.chain();
    const lastSelection = lastSelectionRef.current;

    if (lastSelection) {
      chain.setTextSelection(lastSelection);
    }

    chain.focus().setMark("textStyle", { fontSize: newSize }).run();
  };

  const addLink = () => {
    const url = prompt("Enter URL:");
    if (!url) return;

    const finalUrl = toAbsoluteUrl(url);
    if (!finalUrl) return;

    editor.chain().focus().setLink({ href: finalUrl }).run();
  };

  const addTask = () => {
    onAddTask?.();
  };

  const resizeSelectedImage = (delta: number) => {
    const { selection } = editor.state;
    const selectedNode = (selection as any).node;
    const node =
      selectedNode?.type?.name === "image"
        ? selectedNode
        : selection.$from.nodeAfter;
    if (!node || node.type.name !== "image") return;
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
        background: "#EEF5F8",
        borderBottom: "2px solid #0F172A",
        padding: "6px 16px",
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      {/* Body text label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          background: "#fff",
          border: "2px solid #0F172A",
          marginRight: 4,
        }}
      >
        <span
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#21515F",
          }}
        >
          Body Text
        </span>
        <select
          title="Text size"
          aria-label="Text size"
          value={currentFontSize}
          onMouseDown={() => {
            const { from, to } = editor.state.selection;
            lastSelectionRef.current = { from, to };
          }}
          onChange={handleFontSizeChange}
          style={{
            height: 22,
            fontSize: 10,
            padding: "0 4px",
            border: "1px solid #CBD5E1",
            background: "#EEF5F8",
            fontFamily: "Space Grotesk, sans-serif",
            fontWeight: 700,
            width: "auto",
            cursor: "pointer",
          }}
        >
          <option value="19px">14pt</option>
          <option value="24px">18pt</option>
          <option value="32px">24pt</option>
        </select>
      </div>

      <Sep />

      {/* Undo / Redo */}
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

      <Sep />

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

      <Sep />

      {/* Text format */}
      <ToolBtn
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong style={{ fontFamily: "Inter, sans-serif" }}>B</strong>
      </ToolBtn>
      <ToolBtn
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em style={{ fontFamily: "Inter, sans-serif" }}>I</em>
      </ToolBtn>
      <ToolBtn
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span
          style={{
            textDecoration: "underline",
            fontFamily: "Inter, sans-serif",
          }}
        >
          U
        </span>
      </ToolBtn>
      <ToolBtn
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span
          style={{
            textDecoration: "line-through",
            fontFamily: "Inter, sans-serif",
          }}
        >
          S
        </span>
      </ToolBtn>
      <ToolBtn
        title="Highlight"
        active={editor.isActive("highlight")}
        onClick={() =>
          editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()
        }
      >
        HL
      </ToolBtn>

      <Sep />

      {/* Alignment */}
      <ToolBtn
        title="Align Left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        L
      </ToolBtn>
      <ToolBtn
        title="Align Center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        C
      </ToolBtn>
      <ToolBtn
        title="Align Right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        R
      </ToolBtn>

      <Sep />

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
      <ToolBtn title="Tasks" active={false} onClick={addTask}>
        ☑ Tasks
      </ToolBtn>

      <Sep />

      {/* Blocks */}
      <ToolBtn
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        " "
      </ToolBtn>
      <ToolBtn
        title="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        {"</>"}
      </ToolBtn>
      <ToolBtn title="Link" active={editor.isActive("link")} onClick={addLink}>
        Link
      </ToolBtn>
      <ToolBtn
        title="Horizontal rule"
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        —
      </ToolBtn>

      <Sep />

      {/* Image resize */}
      <ToolBtn
        title="Decrease image size"
        active={false}
        onClick={() => resizeSelectedImage(-40)}
      >
        Img-
      </ToolBtn>
      <ToolBtn
        title="Increase image size"
        active={false}
        onClick={() => resizeSelectedImage(40)}
      >
        Img+
      </ToolBtn>

      <Sep />

      {/* Text color */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          A
        </span>
        <input
          type="color"
          defaultValue="#1a1a18"
          title="Text color"
          aria-label="Text color"
          onChange={(e) =>
            editor.chain().focus().setColor(e.target.value).run()
          }
          style={{
            width: 22,
            height: 22,
            padding: 0,
            border: "2px solid #0F172A",
            cursor: "pointer",
            background: "none",
          }}
        />
      </div>

      <Sep />

      {/* Tasks Panel Toggle */}
      <button
        type="button"
        title={tasksPanelOpen ? "Hide task tracker" : "Show task tracker"}
        aria-label={tasksPanelOpen ? "Hide task tracker" : "Show task tracker"}
        onClick={onToggleTasksPanel}
        style={{
          padding: "4px 8px",
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 11,
          fontWeight: 700,
          background: tasksPanelOpen ? "#21515F" : "transparent",
          color: tasksPanelOpen ? "#fff" : "#475569",
          border: tasksPanelOpen
            ? "2px solid #21515F"
            : "2px solid transparent",
          minWidth: 70,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.1s",
          boxShadow: tasksPanelOpen ? "2px 2px 0px #0F172A" : "none",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
        onMouseEnter={(e) => {
          if (!tasksPanelOpen) {
            (e.currentTarget as HTMLButtonElement).style.background = "#EEF5F8";
            (e.currentTarget as HTMLButtonElement).style.color = "#21515F";
          }
        }}
        onMouseLeave={(e) => {
          if (!tasksPanelOpen) {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#475569";
          }
        }}
      >
        {tasksPanelOpen ? "◀ Tasks" : "▶ Tasks"}
      </button>
    </div>
  );
}
