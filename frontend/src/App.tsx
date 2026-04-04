import React, { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PopupProvider } from "./context/PopupContext";
import { setAuthHeader } from "./utils/api";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import EditorPage from "./pages/EditorPage";

function AppInner() {
  const { token, user, isAuthReady } = useAuth();
  const [page, setPage] = React.useState<"dashboard" | "editor">(() => {
    try {
      const saved = localStorage.getItem("collab_editor_page");
      return (saved as "dashboard" | "editor") || "dashboard";
    } catch {
      return "dashboard";
    }
  });
  const [activeDocId, setActiveDocId] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("collab_active_doc_id") || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setAuthHeader(token);
  }, [token]);

  // Persist page and activeDocId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("collab_editor_page", page);
    } catch {}
  }, [page]);

  useEffect(() => {
    try {
      if (activeDocId) {
        localStorage.setItem("collab_active_doc_id", activeDocId);
      } else {
        localStorage.removeItem("collab_active_doc_id");
      }
    } catch {}
  }, [activeDocId]);

  // Auto-restore editor if doc was open on refresh
  useEffect(() => {
    if (page === "editor" && activeDocId && !user) {
      // User is not loaded yet, wait for auth to complete
      return;
    }
    if (page === "editor" && !activeDocId) {
      // Page says editor but no doc, reset to dashboard
      setPage("dashboard");
    }
  }, [page, activeDocId, user]);

  if (!isAuthReady) {
    return null;
  }

  if (!user || !token) {
    return <AuthPage />;
  }

  if (page === "editor" && activeDocId) {
    return (
      <EditorPage
        docId={activeDocId}
        onBack={() => {
          setPage("dashboard");
          setActiveDocId(null);
        }}
      />
    );
  }

  return (
    <Dashboard
      onOpenDoc={(docId) => {
        setActiveDocId(docId);
        setPage("editor");
      }}
    />
  );
}

export default function App() {
  return (
    <PopupProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </PopupProvider>
  );
}
