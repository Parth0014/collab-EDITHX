import React, { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { setAuthHeader } from "./utils/api";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import EditorPage from "./pages/EditorPage";

function AppInner() {
  const { token, user, isAuthReady } = useAuth();
  const [page, setPage] = React.useState<"dashboard" | "editor">(() => {
    const stored = localStorage.getItem("collab_page");
    return (stored === "editor" ? "editor" : "dashboard") as
      | "dashboard"
      | "editor";
  });
  const [activeDocId, setActiveDocId] = React.useState<string | null>(() => {
    return localStorage.getItem("collab_activeDocId");
  });

  useEffect(() => {
    setAuthHeader(token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem("collab_page", page);
  }, [page]);

  useEffect(() => {
    if (activeDocId) {
      localStorage.setItem("collab_activeDocId", activeDocId);
    } else {
      localStorage.removeItem("collab_activeDocId");
    }
  }, [activeDocId]);

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
          localStorage.removeItem("collab_activeDocId");
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
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
