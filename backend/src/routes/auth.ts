import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import UserModel from "../models/User";
import { authMiddleware, AuthRequest, signToken } from "../middleware/auth";

const router = Router();
const ACTIVE_SESSION_STALE_MS = 2 * 60 * 1000;
const PENDING_LOGIN_MAX_ATTEMPTS = 3;
const PENDING_LOGIN_BLOCK_MS = 5 * 60 * 1000;
const FORCE_LOGIN_GRACE_MS = 20 * 1000;

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }
    const existing = await UserModel.findOne({ email });
    if (existing)
      return res.status(409).json({ error: "Email already registered" });

    // Generate unique collabId (short, shareable)
    const collabId = `${username.toLowerCase().replace(/\s+/g, "-")}-${uuidv4().slice(0, 6)}`;

    const user = await UserModel.create({
      username,
      email,
      password,
      collabId,
    });

    const sessionId = uuidv4();
    user.activeSessionId = sessionId;
    user.activeSessionLastSeenAt = new Date();
    user.tokenVersion = Number(user.tokenVersion || 0);
    await user.save();

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      collabId: user.collabId,
      sessionId,
      tokenVersion: Number(user.tokenVersion || 0),
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        collabId: user.collabId,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, requestId, forceLogin } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const user = await UserModel.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const now = new Date();
    const pending = user.pendingLogin;

    // Auto-clear expired block window.
    if (
      user.pendingLoginBlockedUntil &&
      new Date(user.pendingLoginBlockedUntil).getTime() <= now.getTime()
    ) {
      user.pendingLoginBlockedUntil = undefined as any;
      user.pendingLoginAttemptCount = 0;
      await user.save();
    }

    // Hard block repeated sign-in abuse for this account.
    if (
      user.pendingLoginBlockedUntil &&
      new Date(user.pendingLoginBlockedUntil).getTime() > now.getTime()
    ) {
      return res.status(429).json({
        error:
          "Too many login attempts for this account. Try again after 5 minutes.",
        blockedUntil: user.pendingLoginBlockedUntil,
      });
    }

    if (pending && pending.expiresAt && pending.expiresAt <= now) {
      user.pendingLogin = undefined as any;
      await user.save();
    }

    // If this is the same pending request and it has been approved, finalize login.
    if (
      user.pendingLogin &&
      requestId &&
      user.pendingLogin.requestId === requestId &&
      user.pendingLogin.status === "approved"
    ) {
      user.activeSessionId = user.pendingLogin.newSessionId;
      user.pendingLogin = undefined as any;
      user.tokenVersion = Number(user.tokenVersion || 0);
      user.pendingLoginAttemptCount = 0;
      user.pendingLoginBlockedUntil = undefined as any;
      await user.save();

      const token = signToken({
        userId: user._id.toString(),
        email: user.email,
        username: user.username,
        collabId: user.collabId,
        sessionId: user.activeSessionId!,
        tokenVersion: Number(user.tokenVersion || 0),
      });

      return res.json({
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          collabId: user.collabId,
        },
      });
    }

    // Pending request exists and denied.
    if (
      user.pendingLogin &&
      requestId &&
      user.pendingLogin.requestId === requestId &&
      user.pendingLogin.status === "denied"
    ) {
      user.pendingLogin = undefined as any;
      user.pendingLoginAttemptCount = Math.max(
        Number(user.pendingLoginAttemptCount || 0),
        1,
      );
      await user.save();
      return res
        .status(403)
        .json({ error: "Login request denied by existing session" });
    }

    // Legitimate polling from pending requester should not increment abuse counter.
    if (
      user.pendingLogin &&
      requestId &&
      user.pendingLogin.requestId === requestId &&
      user.pendingLogin.status === "pending"
    ) {
      return res.json({
        requiresApproval: true,
        pending: true,
        requestId: user.pendingLogin.requestId,
        message: "Login request is still pending approval.",
      });
    }

    // Recovery path: when user is stuck (no active device to approve), allow explicit takeover.
    if (forceLogin === true) {
      if (
        !requestId ||
        !user.pendingLogin ||
        user.pendingLogin.requestId !== requestId
      ) {
        return res.status(400).json({
          error:
            "Force login requires a valid pending login request. Please sign in first to create one.",
        });
      }

      const lastSeenAt = user.activeSessionLastSeenAt
        ? new Date(user.activeSessionLastSeenAt).getTime()
        : 0;
      const pendingRequestedAt = user.pendingLogin.requestedAt
        ? new Date(user.pendingLogin.requestedAt).getTime()
        : 0;
      const nowTs = now.getTime();
      const activeRecently =
        lastSeenAt > 0 && nowTs - lastSeenAt <= ACTIVE_SESSION_STALE_MS;
      const pendingFresh =
        pendingRequestedAt > 0 &&
        nowTs - pendingRequestedAt < FORCE_LOGIN_GRACE_MS;
      const activeHeartbeatAfterRequest =
        pendingRequestedAt > 0 && lastSeenAt > pendingRequestedAt;

      if (activeRecently && (pendingFresh || activeHeartbeatAfterRequest)) {
        return res.status(423).json({
          error:
            "Active session appears online. Ask the active device to approve, or wait briefly and try force login again.",
        });
      }

      const sessionId = uuidv4();
      user.activeSessionId = sessionId;
      user.activeSessionLastSeenAt = new Date();
      user.pendingLogin = undefined as any;
      user.tokenVersion = Number(user.tokenVersion || 0);
      user.pendingLoginAttemptCount = 0;
      user.pendingLoginBlockedUntil = undefined as any;
      await user.save();

      const token = signToken({
        userId: user._id.toString(),
        email: user.email,
        username: user.username,
        collabId: user.collabId,
        sessionId,
        tokenVersion: Number(user.tokenVersion || 0),
      });

      return res.json({
        forced: true,
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          collabId: user.collabId,
        },
      });
    }

    // Existing active session: require approval from currently logged-in device.
    if (user.activeSessionId) {
      const nextAttemptCount = Number(user.pendingLoginAttemptCount || 0) + 1;
      user.pendingLoginAttemptCount = nextAttemptCount;

      if (nextAttemptCount >= PENDING_LOGIN_MAX_ATTEMPTS) {
        user.pendingLoginBlockedUntil = new Date(
          now.getTime() + PENDING_LOGIN_BLOCK_MS,
        );
        await user.save();
        return res.status(429).json({
          error:
            "Too many login attempts for this account. Try again after 5 minutes.",
          blockedUntil: user.pendingLoginBlockedUntil,
        });
      }

      if (!user.pendingLogin || user.pendingLogin.status !== "pending") {
        const newRequestId = uuidv4();
        const newSessionId = uuidv4();
        const userAgent = (
          req.headers["user-agent"] || "Unknown device"
        ).toString();
        user.pendingLogin = {
          requestId: newRequestId,
          newSessionId,
          deviceInfo: userAgent,
          status: "pending",
          requestedAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        } as any;
      }

      await user.save();

      return res.status(409).json({
        requiresApproval: true,
        requestId: user.pendingLogin?.requestId,
        message:
          "Login approval sent to your existing device. Please approve there.",
      });
    }

    // No active session: issue a normal login token.
    const sessionId = uuidv4();
    user.activeSessionId = sessionId;
    user.activeSessionLastSeenAt = new Date();
    user.pendingLogin = undefined as any;
    user.tokenVersion = Number(user.tokenVersion || 0);
    user.pendingLoginAttemptCount = 0;
    user.pendingLoginBlockedUntil = undefined as any;
    await user.save();

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      collabId: user.collabId,
      sessionId,
      tokenVersion: Number(user.tokenVersion || 0),
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        collabId: user.collabId,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/auth/session/pending - check if there is a pending login request for current active session owner
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

      if (
        user.pendingLogin.expiresAt &&
        user.pendingLogin.expiresAt <= new Date()
      ) {
        user.pendingLogin = undefined as any;
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
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/auth/session/heartbeat - mark active session as alive
router.post(
  "/session/heartbeat",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await UserModel.findOneAndUpdate(
        {
          _id: req.user!.userId,
          activeSessionId: req.user!.sessionId,
        },
        { activeSessionLastSeenAt: new Date() },
      );

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/auth/session/resolve - approve/deny pending login request on active device
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

      if (action === "approve") {
        user.pendingLogin.status = "approved";
      } else {
        user.pendingLogin.status = "denied";
      }

      await user.save();
      return res.json({ ok: true, action });
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /api/auth/change-password - secure account recovery path from stale public-computer sessions
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

      user.password = newPassword;
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      user.activeSessionId = uuidv4();
      user.activeSessionLastSeenAt = new Date();
      user.pendingLogin = undefined as any;
      await user.save();

      const token = signToken({
        userId: user._id.toString(),
        email: user.email,
        username: user.username,
        collabId: user.collabId,
        sessionId: user.activeSessionId,
        tokenVersion: Number(user.tokenVersion || 0),
      });

      return res.json({
        ok: true,
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          collabId: user.collabId,
        },
      });
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
