import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { PendingLoginRequest, User } from "../types";
import { api } from "../utils/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthReady: boolean;
  pendingLoginRequest: PendingLoginRequest | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  resolvePendingLoginRequest: (
    requestId: string,
    action: "approve" | "deny",
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [pendingLoginRequest, setPendingLoginRequest] =
    useState<PendingLoginRequest | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("collab_auth");
    if (stored) {
      try {
        const { user, token } = JSON.parse(stored);
        setUser(user);
        setToken(token);
      } catch {}
    }
    setIsAuthReady(true);
  }, []);

  const login = (token: string, user: User) => {
    setToken(token);
    setUser(user);
    localStorage.setItem("collab_auth", JSON.stringify({ token, user }));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPendingLoginRequest(null);
    localStorage.removeItem("collab_auth");
  };

  const resolvePendingLoginRequest = async (
    requestId: string,
    action: "approve" | "deny",
  ) => {
    await api.post("/auth/session/resolve", { requestId, action });
    setPendingLoginRequest(null);
  };

  useEffect(() => {
    if (!token) {
      setPendingLoginRequest(null);
      return;
    }

    let mounted = true;

    const checkPending = async () => {
      try {
        const { data } = await api.get("/auth/session/pending");
        if (!mounted) return;
        setPendingLoginRequest(data?.pending || null);
      } catch (err: any) {
        if (!mounted) return;
        if (err?.response?.status === 401) {
          logout();
        }
      }
    };

    checkPending();
    const id = window.setInterval(checkPending, 4000);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    const beat = async () => {
      try {
        await api.post("/auth/session/heartbeat");
      } catch (err: any) {
        if (!mounted) return;
        if (err?.response?.status === 401) {
          logout();
        }
      }
    };

    beat();
    const id = window.setInterval(beat, 15000);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthReady,
        pendingLoginRequest,
        login,
        logout,
        resolvePendingLoginRequest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
