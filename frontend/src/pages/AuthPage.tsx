import React, { useEffect, useState } from "react";
import { api, setAuthHeader } from "../utils/api";
import { useAuth } from "../context/AuthContext";

export default function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    email: string;
    password: string;
    requestId: string;
  } | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : {
              username: form.username,
              email: form.email,
              password: form.password,
            };
      const { data } = await api.post(endpoint, payload);
      setAuthHeader(data.token);
      login(data.token, data.user);
      setPendingApproval(null);
    } catch (err: any) {
      const payload = err?.response?.data;
      if (mode === "login" && payload?.requiresApproval && payload?.requestId) {
        setPendingApproval({
          email: form.email,
          password: form.password,
          requestId: payload.requestId,
        });
        setError(
          payload?.message || "Waiting for approval on your existing device...",
        );
      } else {
        setError(payload?.error || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingApproval) return;

    let mounted = true;
    const retry = async () => {
      try {
        const { data } = await api.post("/auth/login", {
          email: pendingApproval.email,
          password: pendingApproval.password,
          requestId: pendingApproval.requestId,
        });
        if (!mounted) return;

        if (data?.requiresApproval || !data?.token) {
          return;
        }

        setAuthHeader(data.token);
        login(data.token, data.user);
        setPendingApproval(null);
      } catch (err: any) {
        if (!mounted) return;
        const payload = err?.response?.data;
        if (payload?.error?.includes("denied")) {
          setError(payload.error);
          setPendingApproval(null);
        }
      }
    };

    const id = window.setInterval(retry, 3500);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [pendingApproval, login]);

  const forceLogin = async () => {
    if (!pendingApproval) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", {
        email: pendingApproval.email,
        password: pendingApproval.password,
        requestId: pendingApproval.requestId,
        forceLogin: true,
      });
      setAuthHeader(data.token);
      login(data.token, data.user);
      setPendingApproval(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Failed to force login";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F4FAFD",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(#3B6978 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 440,
          padding: "0 24px",
        }}
      >
        {/* Header branding */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#3B6978",
              marginBottom: 8,
            }}
          >
            CollabEdit · v1.0
          </div>
          <h1
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1.1,
              color: "#0F172A",
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
            }}
          >
            THE
            <br />
            <span
              style={{
                color: "#3B6978",
                fontStyle: "italic",
                textDecoration: "underline",
                textDecorationThickness: 3,
                textUnderlineOffset: 6,
              }}
            >
              ARCHIVE
            </span>
          </h1>
          <p
            style={{
              marginTop: 12,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            Real-time collaborative document editing. Invite by CollabID, edit
            together, version everything.
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#fff",
            border: "2px solid #0F172A",
            boxShadow: "6px 6px 0px #0F172A",
            padding: "32px",
          }}
        >
          {/* Mode switcher */}
          <div
            style={{
              display: "flex",
              background: "#EEF5F8",
              border: "2px solid #0F172A",
              marginBottom: 28,
            }}
          >
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                  if (m !== "login") {
                    setPendingApproval(null);
                  }
                }}
                style={{
                  flex: 1,
                  padding: "10px",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  border: "none",
                  borderRight: m === "login" ? "2px solid #0F172A" : "none",
                  background: mode === m ? "#21515F" : "transparent",
                  color: mode === m ? "#fff" : "#475569",
                  cursor: "pointer",
                  transition: "all 0.1s",
                  boxShadow: "none",
                }}
              >
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          <form
            onSubmit={submit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {mode === "register" && (
              <div>
                <label
                  className="section-heading"
                  style={{ display: "block", marginBottom: 6 }}
                >
                  Username
                </label>
                <input
                  name="username"
                  value={form.username}
                  onChange={handle}
                  placeholder="Your display name"
                  required
                />
              </div>
            )}
            <div>
              <label
                className="section-heading"
                style={{ display: "block", marginBottom: 6 }}
              >
                Email
              </label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handle}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label
                className="section-heading"
                style={{ display: "block", marginBottom: 6 }}
              >
                Password
              </label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handle}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "2px solid #DC2626",
                  color: "#DC2626",
                  padding: "10px 14px",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                ⚠ {error}
              </div>
            )}

            {mode === "login" && pendingApproval && (
              <div
                style={{
                  background: "#EEF5F8",
                  border: "2px solid #0F172A",
                  color: "#21515F",
                  padding: "10px 14px",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Waiting for approval from your current active device...
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={forceLogin}
                    disabled={loading}
                  >
                    Force Login Instead
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary btn-lg"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
            >
              {loading
                ? "..."
                : mode === "login"
                  ? "Sign In →"
                  : "Create Account →"}
            </button>
          </form>

          {mode === "register" && (
            <p
              style={{
                marginTop: 20,
                padding: "12px 14px",
                background: "#EEF5F8",
                border: "2px solid #0F172A",
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                color: "#475569",
                lineHeight: 1.5,
              }}
            >
              After registering you'll get a unique{" "}
              <strong
                style={{
                  fontFamily: "Space Grotesk, sans-serif",
                  color: "#21515F",
                }}
              >
                CollabID
              </strong>{" "}
              — share it so others can invite you to documents.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
