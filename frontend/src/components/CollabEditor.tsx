import React, { useEffect, useRef, useState, MutableRefObject } from "react";
import {
  useEditor,
  EditorContent,
  Editor,
  ReactNodeViewRenderer,
  BubbleMenu,
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
import EditorBubbleMenu from "./EditorBubbleMenu";
import LinkCreationModal from "./LinkCreationModal";

const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
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

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: any) => {
          // Always merge into existing textStyle attrs — never replace.
          return chain().setMark("textStyle", { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }: any) => {
          return chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run();
        },
    } as any;
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
// Unchanged from the working version — pointer-events:none on both the caret
// and label is the fix for "can't select through cursors."
const CURSOR_COLORS = [
  "#3b6978",
  "#21515f",
  "#e03131",
  "#f08c00",
  "#7048e8",
  "#0c8599",
];

function getColorFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function renderCursor(
  user: Record<string, any>,
  roomUsers?: { collabId: string; color: string }[],
): HTMLElement {
  const serverColor = roomUsers?.find(
    (r) => r.collabId === user.collabId,
  )?.color;
  const color: string =
    serverColor ??
    user.color ??
    getColorFromSeed(user.collabId ?? user.name ?? "anon");
  const name: string = user.name ?? "?";

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
    "pointer-events: none",
    "user-select: none",
    "-webkit-user-select: none",
    "z-index: 10",
  ].join(";");

  const caret = document.createElement("span");
  caret.classList.add("collaboration-cursor__caret");
  caret.style.cssText = [
    `background-color: ${color}`,
    `border-color: ${color}`,
    "display: inline-block",
    "width: 1px",
    "height: 1.4em",
    "position: relative",
    "margin-left: -1px",
    "margin-right: -1px",
    "word-break: normal",
    "pointer-events: none",
    "user-select: none",
    "-webkit-user-select: none",
    "overflow: visible",
    "z-index: 1",
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
  myCollabId: string;
  username: string;
  editorRef: MutableRefObject<Editor | null>;
  mediaAssets: MediaAsset[];
  roomUsers?: {
    username: string;
    collabId: string;
    color: string;
    userId: string;
  }[];
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CollabEditor({
  ydoc,
  socket,
  docId,
  canEdit,
  myColor,
  myCollabId,
  username,
  editorRef,
  mediaAssets,
  roomUsers,
}: Props) {
  const roomUsersRef = useRef<
    { collabId: string; color: string }[] | undefined
  >(undefined);
  // keep a ref that EditorPage will update via prop (passed below)
  useEffect(() => {
    try {
      roomUsersRef.current = (roomUsers || []).map((r) => ({
        collabId: r.collabId,
        color: r.color,
      }));
    } catch {}
  }, [roomUsers]);

  const awarenessRef = useRef<Awareness | null>(null);
  if (!awarenessRef.current) {
    awarenessRef.current = new Awareness(ydoc);
  }
  const awareness = awarenessRef.current;
  // When server `roomUsers` arrives, align our local awareness color and
  // broadcast the update so other participants immediately see the server
  // color for our cursor.
  useEffect(() => {
    if (!socket) return;
    try {
      const serverEntry = (roomUsers || []).find(
        (r) => r.collabId === myCollabId,
      );
      if (!serverEntry) return;
      const local = (awareness.getLocalState() as any) || {};
      const localUser = local.user || {};
      if (localUser.color === serverEntry.color) return;

      awareness.setLocalStateField("user", {
        name: username,
        color: serverEntry.color,
        collabId: myCollabId,
      });

      const clientId = (awareness as any).clientID as number;
      const update = encodeAwarenessUpdate(awareness, [clientId]);
      socket.emit("awareness-update", {
        docId,
        clientIds: [clientId],
        update: encodeBytesToBase64(update),
      });
    } catch (e) {}
  }, [roomUsers, myCollabId, username, socket, awareness, docId]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // ── Awareness sync (unchanged — this was never the buggy part) ───────────
  useEffect(() => {
    return () => {
      awareness.setLocalState(null);
    };
  }, [awareness]);

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

    const onRequestAwareness = ({
      docId: requestedDocId,
    }: {
      docId: string;
    }) => {
      if (requestedDocId !== docId) return;
      let clientIds = Array.from(awareness.getStates().keys());
      const localClientId = (awareness as any).clientID as number;
      // Ensure we include our own client id so the joining client receives at
      // least our local presence even if the states map is currently empty.
      if (!clientIds.includes(localClientId))
        clientIds = [...clientIds, localClientId];

      if (clientIds.length === 0) return;

      const awarenessUpdate = encodeAwarenessUpdate(awareness, clientIds);
      socket.emit("awareness-update", {
        docId,
        clientIds,
        update: encodeBytesToBase64(awarenessUpdate),
      });
    };

    awareness.on("update", onAwarenessUpdate);
    socket.on("awareness-update", onRemoteAwarenessUpdate);
    socket.on("awareness-remove", onRemoteAwarenessRemove);
    socket.on("request-awareness", onRequestAwareness);

    return () => {
      awareness.off("update", onAwarenessUpdate);
      socket.off("awareness-update", onRemoteAwarenessUpdate);
      socket.off("awareness-remove", onRemoteAwarenessRemove);
      socket.off("request-awareness", onRequestAwareness);
    };
  }, [awareness, docId, socket]);

  // ── Editor setup ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,

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

        hardBreak: false,
      }),

      Collaboration.configure({ document: ydoc }),

      CollaborationCursor.configure({
        provider: { awareness } as any,
        user: { name: username, color: myColor, collabId: myCollabId },
        render: (user) => renderCursor(user, roomUsersRef.current),
      }),

      Placeholder.configure({
        placeholder: "Start writing… Invite others with your CollabID",
      }),

      Underline,

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

      // Order matters for readability only, not for merge safety: TextStyle
      // must exist before Color/FontSize since both target it. Color ships
      // its own safe setColor command; FontSize's commands above do the same.
      TextStyle,
      Color,
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

  useEffect(() => {
    if (!editor) return;

    const forceCursorRedraw = () => {
      editor.view.dispatch(editor.view.state.tr);
    };

    awareness.on("update", forceCursorRedraw);
    return () => {
      awareness.off("update", forceCursorRedraw);
    };
  }, [editor, awareness]);

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
    awareness.setLocalStateField("user", {
      name: username,
      color: myColor,
      collabId: myCollabId,
    });
    // ensure the awareness local state color matches server room user color if provided
    try {
      const local = awareness.getLocalState() || {};
      if (!local.user || local.user.color !== myColor) {
        awareness.setLocalStateField("user", {
          ...(local.user || {}),
          name: username,
          color: myColor,
          collabId: myCollabId,
        });
      }
    } catch {}
  }, [awareness, myColor, myCollabId, username]);

  // Immediately broadcast our local awareness once we've set it so other
  // participants (including newcomers) receive our presence without waiting
  // for a selection change. This helps avoid the "no remote cursors until
  // someone moves" problem.
  useEffect(() => {
    if (!socket) return;
    try {
      const clientId = (awareness as any).clientID as number;
      const clientIds = [clientId];
      const update = encodeAwarenessUpdate(awareness, clientIds);
      socket.emit("awareness-update", {
        docId,
        clientIds,
        update: encodeBytesToBase64(update),
      });
    } catch (e) {}
  }, [socket, awareness, docId]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      awareness.setLocalState(null);
    };
  }, [awareness]);

  const openLinkModal = () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    const activeLink = editor.isActive("link");
    const activeUrl = activeLink ? editor.getAttributes("link").href || "" : "";

    setLinkText(selectedText);
    setLinkUrl(activeUrl);
    setLinkModalOpen(true);
  };

  const handleLinkSubmit = (textValue: string, urlValue: string) => {
    if (!editor) return;
    const finalUrl = toAbsoluteUrl(urlValue);
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");

    if (textValue.trim() === selectedText.trim()) {
      editor.chain().focus().setLink({ href: finalUrl }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, [
          {
            type: "text",
            text: textValue.trim(),
            marks: [{ type: "link", attrs: { href: finalUrl } }],
          },
        ])
        .run();
    }

    setLinkModalOpen(false);
  };

  const handleLinkUnlink = () => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setLinkModalOpen(false);
  };

  return (
    <div className="collab-editor-container">
      {editor && (
        <EditorBubbleMenu editor={editor} onLinkClick={openLinkModal} />
      )}
      <EditorContent editor={editor} />
      <LinkCreationModal
        open={linkModalOpen}
        initialText={linkText}
        initialUrl={linkUrl}
        onClose={() => setLinkModalOpen(false)}
        onSubmit={handleLinkSubmit}
        onUnlink={handleLinkUnlink}
      />
    </div>
  );
}
