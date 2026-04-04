import React, { createContext, ReactNode, useContext, useState } from "react";

type DialogKind = "alert" | "confirm";

interface DialogState {
  kind: DialogKind;
  title: string;
  message: string;
  resolve: (value: boolean) => void;
}

interface PopupContextType {
  showAlert: (message: string, title?: string) => Promise<void>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
}

const PopupContext = createContext<PopupContextType | null>(null);

export function PopupProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const showAlert = (message: string, title = "Notice") =>
    new Promise<void>((resolve) => {
      setDialog({
        kind: "alert",
        title,
        message,
        resolve: () => resolve(),
      });
    });

  const showConfirm = (message: string, title = "Confirm") =>
    new Promise<boolean>((resolve) => {
      setDialog({
        kind: "confirm",
        title,
        message,
        resolve,
      });
    });

  const closeDialog = (value: boolean) => {
    if (!dialog) return;
    dialog.resolve(value);
    setDialog(null);
  };

  return (
    <PopupContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 16,
          }}
          onClick={() => closeDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              border: "2px solid #0F172A",
              boxShadow: "6px 6px 0px #0F172A",
              padding: 18,
            }}
          >
            <div
              style={{
                fontFamily: "Space Grotesk, sans-serif",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#0F172A",
                marginBottom: 10,
              }}
            >
              {dialog.title}
            </div>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                lineHeight: 1.5,
                color: "#334155",
                marginBottom: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {dialog.message}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              {dialog.kind === "confirm" && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => closeDialog(false)}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => closeDialog(true)}
              >
                {dialog.kind === "confirm" ? "Confirm" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PopupContext.Provider>
  );
}

export function usePopup() {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error("usePopup must be used within PopupProvider");
  return ctx;
}
