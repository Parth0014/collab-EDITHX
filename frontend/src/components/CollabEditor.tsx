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
              if (!attributes.fontSize) {
                return {};
              }

              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
});

const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-width") || null,
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {};
          }
          return {
            "data-width": attributes.width,
          };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

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

function socketIdToNumber(socketId: string): number {
  let hash = 0;
  for (let i = 0; i < socketId.length; i += 1) {
    hash = (hash * 31 + socketId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

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

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

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

  useEffect(() => {
    if (!socket) return;

    const onAwarenessUpdate = (
      {
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      },
      origin: any,
    ) => {
      if (origin === "remote-awareness") {
        return;
      }

      const changedClients = [...added, ...updated, ...removed];
      if (changedClients.length === 0) {
        return;
      }

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
        // Ignore malformed awareness packets from older clients.
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider: {
          awareness,
        } as any,
        user: { name: username, color: myColor },
      }),
      Placeholder.configure({
        placeholder: "Start writing… Invite others with your CollabID",
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          title: "Ctrl/Cmd + Left Click to open link",
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

          if (!isCtrlOrCmd || !target) {
            return false;
          }

          const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
          if (!anchor) {
            return false;
          }

          const href = anchor.getAttribute("href") || "";
          if (!href || href.startsWith("#")) {
            return false;
          }

          const absoluteUrl = toAbsoluteUrl(href);
          if (!absoluteUrl) {
            return false;
          }

          event.preventDefault();
          window.open(absoluteUrl, "_blank", "noopener,noreferrer");
          return true;
        },
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    awareness.setLocalStateField("user", {
      name: username,
      color: myColor,
    });
  }, [awareness, myColor, username]);

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
