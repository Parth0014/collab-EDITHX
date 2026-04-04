import React, { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PopupProvider } from "./context/PopupContext";
import { setAuthHeader } from "./utils/api";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import EditorPage from "./pages/EditorPage";

function AppInner() {
  const { token, user, isAuthReady } = useAuth();
  const [page, setPage] = React.useState<"dashboard" | "editor">("dashboard");
  const [activeDocId, setActiveDocId] = React.useState<string | null>(null);

  useEffect(() => {
    setAuthHeader(token);
  }, [token]);

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
