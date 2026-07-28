import React from "react";
import { BubbleMenu, Editor } from "@tiptap/react";

function BubbleBtn({
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
        padding: "5px 9px",
        fontFamily: "Space Grotesk, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        background: active ? "#21515F" : "transparent",
        color: active ? "#fff" : "#0F172A",
        border: "none",
        borderRight: "1px solid #0F172A",
        minWidth: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "#EEF5F8";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
        }
      }}
    >
      {children}
    </button>
  );
}

export default function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const addLink = () => {
    const url = prompt("Enter URL:");
    if (!url) return;
    const value = url.trim();
    if (!value) return;
    const finalUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    editor.chain().focus().setLink({ href: finalUrl }).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, offset: [0, 10] }}
      // Only show when there's an actual text selection — never on collapsed
      // cursor, and never inside a code block where inline marks don't apply.
      shouldShow={({ state, from, to }) => {
        const isTextSelection = from !== to;
        const isCodeBlock =
          state.selection.$from.parent.type.name === "codeBlock";
        return isTextSelection && !isCodeBlock;
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          background: "#fff",
          border: "2px solid #0F172A",
          boxShadow: "3px 3px 0px #0F172A",
          overflow: "hidden",
        }}
      >
        <BubbleBtn
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong style={{ fontFamily: "Inter, sans-serif" }}>B</strong>
        </BubbleBtn>
        <BubbleBtn
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em style={{ fontFamily: "Inter, sans-serif" }}>I</em>
        </BubbleBtn>
        <BubbleBtn
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
        </BubbleBtn>
        <BubbleBtn
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
        </BubbleBtn>
        <BubbleBtn
          title="Highlight"
          active={editor.isActive("highlight")}
          onClick={() =>
            editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()
          }
        >
          HL
        </BubbleBtn>
        <BubbleBtn
          title="Link"
          active={editor.isActive("link")}
          onClick={addLink}
        >
          Link
        </BubbleBtn>
      </div>
    </BubbleMenu>
  );
}
