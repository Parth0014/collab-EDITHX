import React, { useEffect, useRef, useState } from "react";
import { api, setAuthHeader } from "../utils/api";
import { useAuth } from "../context/AuthContext";

// How often the pending-approval poll fires (ms).
const POLL_INTERVAL_MS = 3500;

// After this long without a response the pending request is considered expired
// on the frontend too — matches the server's PENDING_LOGIN_TTL_MS (5 min).
const PENDING_TTL_MS = 5 * 60 * 1000;

type Mode = "login" | "register";

// All the state the poll loop needs, kept in a ref so the interval closure
// always sees the latest values without triggering re-renders.
interface PendingState {
  email: string;
  password: string;
  requestId: string;
  startedAt: number; // Date.now() when the pending state was created
}

export default function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // pendingState drives the poll loop. It is set when the server returns
  // 409 requiresApproval and cleared on any terminal response.
  const [pendingState, setPendingState] = useState<PendingState | null>(null);

  // Countdown display for the rate-limit block (seconds remaining).
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function stopPolling() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function clearPending() {
    setPendingState(null);
    stopPolling();
  }

  function handleToken(data: { token: string; user: any }) {
    setAuthHeader(data.token);
    login(data.token, data.user);
    clearPending();
  }

  // ------------------------------------------------------------------
  // Submit (initial login / register)
  // ------------------------------------------------------------------
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBlockedUntil(null);
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

      // Successful login or register.
      handleToken(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const payload = err?.response?.data;

      if (status === 409 && payload?.requiresApproval && payload?.requestId) {
        // Server wants approval from the active device.
        setPendingState({
          email: form.email,
          password: form.password,
          requestId: payload.requestId,
          startedAt: Date.now(),
        });
        setError(
          payload?.message ?? "Waiting for approval on your existing device…",
        );
      } else if (status === 429) {
        // Rate limited — show countdown, do NOT start a poll.
        if (payload?.blockedUntil) {
          setBlockedUntil(new Date(payload.blockedUntil));
        }
        setError(payload?.error ?? "Too many attempts. Try again later.");
      } else {
        setError(payload?.error ?? "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Poll loop — runs only while pendingState is set.
  // Sends email + password + requestId so the server can match the record
  // without creating a new one (no counter increment on matching requestId).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!pendingState) {
      stopPolling();
      return;
    }

    const poll = async () => {
      // Client-side expiry guard — avoid polling forever if the server TTL
      // was somehow missed.
      if (Date.now() - pendingState.startedAt > PENDING_TTL_MS) {
        setError("Approval request expired. Please try logging in again.");
        clearPending();
        return;
      }

      try {
        const { data } = await api.post("/auth/login", {
          email: pendingState.email,
          password: pendingState.password,
          requestId: pendingState.requestId,
        });

        // Terminal: approved — server returned a token.
        if (data?.token) {
          handleToken(data);
        }
        // Non-terminal 200 with no token shouldn't happen, but just loop.
      } catch (err: any) {
        const status = err?.response?.status;
        const payload = err?.response?.data;

        if (status === 409 && payload?.pending === true) {
          // Still waiting — non-terminal, loop continues.
          return;
        }

        // Everything else is terminal — stop the loop and show the error.
        if (status === 403) {
          setError("Login request was denied by your active session.");
        } else if (status === 429) {
          if (payload?.blockedUntil) {
            setBlockedUntil(new Date(payload.blockedUntil));
          }
          setError(payload?.error ?? "Too many attempts. Try again later.");
        } else {
          setError(payload?.error ?? "Something went wrong. Please try again.");
        }

        clearPending();
      }
    };

    // Fire immediately, then on the interval.
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
    // pendingState is stable per approval cycle — the ref identity only
    // changes when setPendingState is called with a new object.
  }, [pendingState]);

  // ------------------------------------------------------------------
  // Countdown ticker for the block display.
  // ------------------------------------------------------------------
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(0);

  useEffect(() => {
    if (!blockedUntil) return;

    const tick = () => {
      const diff = Math.max(
        0,
        Math.ceil((blockedUntil.getTime() - Date.now()) / 1000),
      );
      setBlockSecondsLeft(diff);
      if (diff === 0) {
        setBlockedUntil(null);
        setError("");
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  // ------------------------------------------------------------------
  // Force login — bypass approval when the active device is offline.
  // ------------------------------------------------------------------
  const forceLogin = async () => {
    if (!pendingState) return;
    setLoading(true);
    setError("");

    try {
      const { data } = await api.post("/auth/login", {
        email: pendingState.email,
        password: pendingState.password,
        requestId: pendingState.requestId,
        forceLogin: true,
      });
      handleToken(data);
    } catch (err: any) {
      const payload = err?.response?.data;
      setError(payload?.error ?? "Force login failed. Try again.");
      // Do NOT clear pending — user can still wait for approval or retry.
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Mode switch — wipe all in-flight state.
  // ------------------------------------------------------------------
  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setBlockedUntil(null);
    clearPending();
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const isWaitingApproval = pendingState !== null;
  const isBlocked = blockedUntil !== null;

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
      {/* Background dot grid */}
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
        {/* Branding */}
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
                onClick={() => switchMode(m)}
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
                  disabled={isWaitingApproval || isBlocked}
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
                disabled={isWaitingApproval || isBlocked}
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
                disabled={isWaitingApproval || isBlocked}
              />
            </div>

            {/* Error banner */}
            {error && (
              <div
                style={{
                  background: isWaitingApproval ? "#EEF5F8" : "#FEF2F2",
                  border: `2px solid ${isWaitingApproval ? "#21515F" : "#DC2626"}`,
                  color: isWaitingApproval ? "#21515F" : "#DC2626",
                  padding: "10px 14px",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {isWaitingApproval ? "⏳" : "⚠"} {error}
              </div>
            )}

            {/* Approval waiting panel */}
            {isWaitingApproval && (
              <div
                style={{
                  background: "#EEF5F8",
                  border: "2px solid #0F172A",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "Space Grotesk, sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#21515F",
                  }}
                >
                  Waiting for approval from your active device…
                </div>
                <div
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    color: "#475569",
                  }}
                >
                  Check your other device and approve the sign-in request. If
                  that device is unavailable, you can force login below.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={forceLogin}
                    disabled={loading}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    Sign In Anyway
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      clearPending();
                      setError("");
                    }}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Rate limit countdown */}
            {isBlocked && blockSecondsLeft > 0 && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "2px solid #DC2626",
                  padding: "10px 14px",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#DC2626",
                  letterSpacing: "0.05em",
                }}
              >
                Try again in {blockSecondsLeft}s
              </div>
            )}

            {/* Primary action button */}
            {!isWaitingApproval && (
              <button
                type="submit"
                className="btn-primary btn-lg"
                disabled={loading || isBlocked}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 4,
                }}
              >
                {loading
                  ? "…"
                  : mode === "login"
                    ? "Sign In →"
                    : "Create Account →"}
              </button>
            )}
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
