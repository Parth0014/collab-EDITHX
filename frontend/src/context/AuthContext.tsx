import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User } from "../types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthReady: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

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
    localStorage.removeItem("collab_auth");
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
