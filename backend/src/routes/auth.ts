import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import UserModel from "../models/User";
import { authMiddleware, AuthRequest, signToken } from "../middleware/auth";

const router = Router();

// Constants — all in one place so they are easy to tune
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000; // approval request lives 5 min
const RATE_LIMIT_MAX_ATTEMPTS = 3; // new approval requests before block
const RATE_LIMIT_BLOCK_MS = 5 * 60 * 1000; // block duration
const ACTIVE_SESSION_STALE_MS = 2 * 60 * 1000; // heartbeat age before "stale"
const FORCE_LOGIN_MIN_PENDING_AGE_MS = 20 * 1000; // must wait 20 s before force

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Issue a brand-new session for a user and return a signed JWT. */
function issueSession(user: any): string {
  const sessionId = uuidv4();
  user.activeSessionId = sessionId;
  user.activeSessionLastSeenAt = new Date();
  // Increment tokenVersion so every previously issued token is invalidated.
  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  // Clean up any lingering approval/rate-limit state.
  user.pendingLogin = undefined;
  user.loginAttemptCount = 0;
  user.loginBlockedUntil = undefined;

  return signToken({
    userId: user._id.toString(),
    email: user.email,
    username: user.username,
    collabId: user.collabId,
    sessionId,
    tokenVersion: user.tokenVersion,
  });
}

function userPublic(user: any) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    collabId: user.collabId,
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const collabId = `${username.toLowerCase().replace(/\s+/g, "-")}-${uuidv4().slice(0, 6)}`;
    const user = await UserModel.create({
      username,
      email,
      password,
      collabId,
      tokenVersion: 0,
    });

    const token = issueSession(user);
    await user.save();

    return res.status(201).json({ token, user: userPublic(user) });
  } catch (err) {
    console.error("[register]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
//
// The five guards run in strict order — no branch may skip an earlier guard.
//
// Guard 1 — Verify credentials                     → 401 on failure
// Guard 2 — Check rate limit                        → 429 if blocked
// Guard 3 — Expire stale pending record             → (cleanup, always runs)
// Guard 4 — Branch: no session vs. has session
//   No-session path  → issue token immediately      → 200
//   Has-session path → Guard 5
// Guard 5 — Handle approval flow
//   5a. requestId matches + approved                → issue token → 200
//   5b. requestId matches + denied                  → clear pending → 403
//   5c. requestId matches + still pending           → 409 { pending: true }
//   5d. New request, increment counter, check limit
//       count >= max → set block, clear pending     → 429
//       count < max  → create pending record        → 409 { requiresApproval }
// ---------------------------------------------------------------------------
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, requestId, forceLogin } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // ------------------------------------------------------------------
    // Guard 1: verify credentials
    // ------------------------------------------------------------------
    const user = await UserModel.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const now = new Date();

    // ------------------------------------------------------------------
    // Guard 2: rate limit check
    // Auto-clear an expired block first so a user who waited can retry.
    // ------------------------------------------------------------------
    if (user.loginBlockedUntil) {
      if (user.loginBlockedUntil > now) {
        // Still within the block window — reject immediately.
        return res.status(429).json({
          error: "Too many login attempts. Try again later.",
          blockedUntil: user.loginBlockedUntil,
        });
      }
      // Block has expired — reset rate-limit state before continuing.
      user.loginBlockedUntil = undefined;
      user.loginAttemptCount = 0;
      // pendingLogin was already cleared when the block was set (see Guard 5d),
      // so we do not need to touch it here.
    }

    // ------------------------------------------------------------------
    // Guard 3: expire stale pending record
    // Always runs so we never act on an expired approval request.
    // ------------------------------------------------------------------
    if (user.pendingLogin && user.pendingLogin.expiresAt <= now) {
      user.pendingLogin = undefined;
    }

    // ------------------------------------------------------------------
    // Guard 4: branch on whether an active session exists
    // ------------------------------------------------------------------
    if (!user.activeSessionId) {
      // ----------------------------------------------------------------
      // No-session path — issue a fresh token immediately.
      // ----------------------------------------------------------------
      const token = issueSession(user);
      await user.save();
      return res.json({ token, user: userPublic(user) });
    }

    // ------------------------------------------------------------------
    // Has-session path — fall through to Guard 5.
    // ------------------------------------------------------------------

    // Handle force-login before the normal approval flow so it can bypass
    // a stuck pending state when the active device is genuinely offline.
    if (forceLogin === true) {
      if (
        !requestId ||
        !user.pendingLogin ||
        user.pendingLogin.requestId !== requestId
      ) {
        return res.status(400).json({
          error:
            "Force login requires a valid pending requestId. Submit a normal login first.",
        });
      }

      const lastSeen = user.activeSessionLastSeenAt?.getTime() ?? 0;
      const pendingAge =
        now.getTime() - (user.pendingLogin.requestedAt?.getTime() ?? 0);
      const sessionActiveRecently =
        now.getTime() - lastSeen < ACTIVE_SESSION_STALE_MS;
      const pendingTooFresh = pendingAge < FORCE_LOGIN_MIN_PENDING_AGE_MS;
      const sessionHeartbeatedAfterRequest =
        lastSeen > (user.pendingLogin.requestedAt?.getTime() ?? 0);

      if (
        sessionActiveRecently &&
        (pendingTooFresh || sessionHeartbeatedAfterRequest)
      ) {
        return res.status(423).json({
          error:
            "Active session appears online. Approve from that device, or wait and try force login again.",
        });
      }

      const token = issueSession(user);
      await user.save();
      return res.json({ forced: true, token, user: userPublic(user) });
    }

    // ------------------------------------------------------------------
    // Guard 5: approval flow
    // ------------------------------------------------------------------

    // 5a / 5b / 5c — requestId was supplied and matches the pending record.
    if (
      requestId &&
      user.pendingLogin &&
      user.pendingLogin.requestId === requestId
    ) {
      const status = user.pendingLogin.status;

      if (status === "approved") {
        // 5a — approved: issue session, clear everything.
        const token = issueSession(user);
        await user.save();
        return res.json({ token, user: userPublic(user) });
      }

      if (status === "denied") {
        // 5b — denied: clear the pending record, return 403.
        // Do NOT increment the attempt counter — the user did not create a
        // new approval request; the existing one was simply rejected.
        user.pendingLogin = undefined;
        await user.save();
        return res
          .status(403)
          .json({ error: "Login request denied by existing session." });
      }

      // 5c — still pending: return status without touching the counter.
      return res.status(409).json({
        requiresApproval: true,
        pending: true,
        requestId: user.pendingLogin.requestId,
        message: "Login request is still waiting for approval.",
      });
    }

    // 5d — no matching requestId: this is a brand-new approval request.
    // Increment the counter FIRST, then check against the limit.
    const newCount = Number(user.loginAttemptCount ?? 0) + 1;
    user.loginAttemptCount = newCount;

    if (newCount >= RATE_LIMIT_MAX_ATTEMPTS) {
      // Hit the limit — set block and atomically clear any pending record
      // so the two states cannot coexist.
      user.loginBlockedUntil = new Date(now.getTime() + RATE_LIMIT_BLOCK_MS);
      user.pendingLogin = undefined;
      await user.save();
      return res.status(429).json({
        error: "Too many login attempts. Try again later.",
        blockedUntil: user.loginBlockedUntil,
      });
    }

    // Under the limit — create a fresh pending approval record.
    const newRequestId = uuidv4();
    const newSessionId = uuidv4();
    const deviceInfo = (
      req.headers["user-agent"] ?? "Unknown device"
    ).toString();

    user.pendingLogin = {
      requestId: newRequestId,
      newSessionId,
      deviceInfo,
      status: "pending",
      requestedAt: now,
      expiresAt: new Date(now.getTime() + PENDING_LOGIN_TTL_MS),
    };
    await user.save();

    return res.status(409).json({
      requiresApproval: true,
      requestId: newRequestId,
      message: "Approval request sent to your active device.",
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/session/pending
// Called by the active device to check whether someone is requesting access.
// ---------------------------------------------------------------------------
router.get(
  "/session/pending",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await UserModel.findById(req.user!.userId).select(
        "pendingLogin",
      );

      if (!user?.pendingLogin || user.pendingLogin.status !== "pending") {
        return res.json({ pending: null });
      }

      if (user.pendingLogin.expiresAt <= new Date()) {
        user.pendingLogin = undefined;
        await user.save();
        return res.json({ pending: null });
      }

      return res.json({
        pending: {
          requestId: user.pendingLogin.requestId,
          deviceInfo: user.pendingLogin.deviceInfo,
          requestedAt: user.pendingLogin.requestedAt,
        },
      });
    } catch (err) {
      console.error("[session/pending]", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/session/heartbeat
// Active device pings this to prove it is still alive.
// ---------------------------------------------------------------------------
router.post(
  "/session/heartbeat",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await UserModel.findOneAndUpdate(
        { _id: req.user!.userId, activeSessionId: req.user!.sessionId },
        { activeSessionLastSeenAt: new Date() },
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error("[session/heartbeat]", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/session/resolve
// Active device approves or denies a pending login request.
// ---------------------------------------------------------------------------
router.post(
  "/session/resolve",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { requestId, action } = req.body as {
        requestId?: string;
        action?: "approve" | "deny";
      };

      if (!requestId || !action) {
        return res
          .status(400)
          .json({ error: "requestId and action are required" });
      }

      const user = await UserModel.findById(req.user!.userId);

      if (!user?.pendingLogin || user.pendingLogin.requestId !== requestId) {
        return res
          .status(404)
          .json({ error: "Pending login request not found" });
      }

      user.pendingLogin.status = action === "approve" ? "approved" : "denied";
      await user.save();

      return res.json({ ok: true, action });
    } catch (err) {
      console.error("[session/resolve]", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// Invalidates all existing sessions by bumping tokenVersion.
// ---------------------------------------------------------------------------
router.post(
  "/change-password",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ error: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "New password must be at least 6 characters" });
      }

      const user = await UserModel.findById(req.user!.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const valid = await user.comparePassword(currentPassword);
      if (!valid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Set the new password — the pre-save hook will hash it.
      user.password = newPassword;
      // issueSession bumps tokenVersion, sets a new sessionId, clears pending/block.
      const token = issueSession(user);
      await user.save();

      return res.json({ ok: true, token, user: userPublic(user) });
    } catch (err) {
      console.error("[change-password]", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;