import React, { useEffect, useRef, MutableRefObject } from "react";
import {
  useEditor,
  EditorContent,
  Editor,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness.js";
import * as Y from "yjs";
import { Socket } from "socket.io-client";
import { MediaAsset } from "../types";
import ResizableImageView from "./ResizableImageView";

// ── FontSize extension ──────────────────────────────────────────────────────
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

// ── ResizableImage extension ────────────────────────────────────────────────
const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-width") || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { "data-width": attributes.width };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function toAbsoluteUrl(rawHref: string): string {
  const value = rawHref.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

// ── Cursor renderer ─────────────────────────────────────────────────────────
// The CollaborationCursor `render` option takes a single `user` Record and
// must return one HTMLElement (the caret). The name label is a child of it.
// Both elements get pointer-events:none so they NEVER block text selection
// or clicks — this is the fix for the "can't select through cursors" UX bug.
function renderCursor(user: Record<string, any>): HTMLElement {
  const color: string = user.color ?? "#3b6978";
  const name: string = user.name ?? "?";

  // Name label — floats above the caret line
  const label = document.createElement("span");
  label.classList.add("collaboration-cursor__label");
  label.textContent = name;
  label.style.cssText = [
    `background-color: ${color}`,
    "color: #fff",
    "font-family: Space Grotesk, sans-serif",
    "font-size: 10px",
    "font-weight: 700",
    "padding: 2px 6px",
    "position: absolute",
    "top: -1.5em",
    "left: -1px",
    "white-space: nowrap",
    "text-transform: uppercase",
    "letter-spacing: 0.05em",
    "border-radius: 2px 2px 2px 0",
    // KEY: label must never intercept pointer events
    "pointer-events: none",
    "user-select: none",
    "-webkit-user-select: none",
    "z-index: 10",
  ].join(";");

  // Caret line
  const caret = document.createElement("span");
  caret.classList.add("collaboration-cursor__caret");
  caret.style.cssText = [
    `border-left: 2px solid ${color}`,
    "position: relative",
    "margin-left: -1px",
    "margin-right: -1px",
    "word-break: normal",
    // KEY: caret must never intercept pointer events
    "pointer-events: none",
    "user-select: none",
    "-webkit-user-select: none",
  ].join(";");

  caret.appendChild(label);
  return caret;
}

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  ydoc: Y.Doc;
  socket: Socket | null;
  docId: string;
  canEdit: boolean;
  myColor: string;
  username: string;
  editorRef: MutableRefObject<Editor | null>;
  mediaAssets: MediaAsset[];
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CollabEditor({
  ydoc,
  socket,
  docId,
  canEdit,
  myColor,
  username,
  editorRef,
  mediaAssets,
}: Props) {
  const awarenessRef = useRef<Awareness>(new Awareness(ydoc));
  const awareness = awarenessRef.current;

  // ── Awareness sync ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onAwarenessUpdate = (
      {
        added,
        updated,
        removed,
      }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === "remote-awareness") return;
      const changedClients = [...added, ...updated, ...removed];
      if (changedClients.length === 0) return;
      const awarenessUpdate = encodeAwarenessUpdate(awareness, changedClients);
      socket.emit("awareness-update", {
        docId,
        clientIds: changedClients,
        update: encodeBytesToBase64(awarenessUpdate),
      });
    };

    const onRemoteAwarenessUpdate = ({ update }: { update: string }) => {
      try {
        const updateBytes = Uint8Array.from(atob(update), (c) =>
          c.charCodeAt(0),
        );
        applyAwarenessUpdate(awareness, updateBytes, "remote-awareness");
      } catch {
        // Ignore malformed awareness packets.
      }
    };

    const onRemoteAwarenessRemove = ({
      clientIds,
    }: {
      clientIds: number[];
    }) => {
      removeAwarenessStates(awareness, clientIds, "remote-awareness");
    };

    awareness.on("update", onAwarenessUpdate);
    socket.on("awareness-update", onRemoteAwarenessUpdate);
    socket.on("awareness-remove", onRemoteAwarenessRemove);

    return () => {
      awareness.off("update", onAwarenessUpdate);
      socket.off("awareness-update", onRemoteAwarenessUpdate);
      socket.off("awareness-remove", onRemoteAwarenessRemove);
    };
  }, [awareness, docId, socket]);

  // ── Editor setup ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // REQUIRED when using Collaboration — Yjs handles undo/redo.
        history: false,

        // FIX: keepMarks/keepAttributes preserve formatting (bold, color, etc.)
        // when Enter is pressed inside a list item to continue the list.
        bulletList: {
          keepMarks: true,
          keepAttributes: true,
          HTMLAttributes: { class: "bullet-list-node" },
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: true,
          HTMLAttributes: { class: "ordered-list-node" },
        },
        listItem: {
          HTMLAttributes: { class: "list-item-node" },
        },

        blockquote: {
          HTMLAttributes: { class: "blockquote-node" },
        },
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        paragraph: {
          HTMLAttributes: { class: "paragraph-node" },
        },

        // FIX: Disable hard-break (Shift+Enter → <br>) so it doesn't compete
        // with the list item's own Enter key handler and break list continuation.
        hardBreak: false,
      }),

      Collaboration.configure({ document: ydoc }),

      // FIX: Pass our custom render function which sets pointer-events:none
      // on both the caret and the label, so other users' cursors never
      // intercept mouse clicks or drag-selection.
      CollaborationCursor.configure({
        provider: { awareness } as any,
        user: { name: username, color: myColor },
        render: renderCursor,
      }),

      Placeholder.configure({
        placeholder: "Start writing… Invite others with your CollabID",
      }),

      Underline,

      // FIX: Include listItem so text alignment works inside list items too.
      TextAlign.configure({
        types: ["heading", "paragraph", "blockquote", "listItem"],
      }),

      Highlight.configure({ multicolor: true }),

      TaskList.configure({
        HTMLAttributes: { class: "task-list-node" },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "task-item-node" },
      }),

      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          title: "Ctrl/Cmd + Left Click to open link",
          rel: "noopener noreferrer",
        },
      }),

      ResizableImage.configure({ inline: false, allowBase64: true }),

      Color,
      TextStyle,
      FontSize,
    ],

    editable: canEdit,

    editorProps: {
      attributes: { class: "prose-editor" },

      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement | null;
          const mouseEvent = event as MouseEvent;
          const isCtrlOrCmd = mouseEvent.ctrlKey || mouseEvent.metaKey;
          if (!isCtrlOrCmd || !target) return false;
          const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
          if (!anchor) return false;
          const href = anchor.getAttribute("href") || "";
          if (!href || href.startsWith("#")) return false;
          const absoluteUrl = toAbsoluteUrl(href);
          if (!absoluteUrl) return false;
          event.preventDefault();
          window.open(absoluteUrl, "_blank", "noopener,noreferrer");
          return true;
        },
      },
    },
  });

  // ── Sync editorRef ────────────────────────────────────────────────────────
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  // ── Sync canEdit ──────────────────────────────────────────────────────────
  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  // ── Sync awareness user ───────────────────────────────────────────────────
  useEffect(() => {
    awareness.setLocalStateField("user", { name: username, color: myColor });
  }, [awareness, myColor, username]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      awareness.setLocalState(null);
      awareness.destroy();
    };
  }, [awareness]);

  return (
    <div className="collab-editor-container">
      <EditorContent editor={editor} />
    </div>
  );
}
