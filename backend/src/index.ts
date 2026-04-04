import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Server } from "socket.io";
import authRouter from "./routes/auth";
import documentRouter from "./routes/document";
import mediaRouter from "./routes/media";
import { setupSocket } from "./socket/socketHandler";

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "";
const MONGO_URI = (process.env.MONGO_URI || "")
  .trim()
  .replace(/^['\"]|['\"]$/g, "");
const PORT = process.env.PORT || "3000";

if (
  !MONGO_URI ||
  (!MONGO_URI.startsWith("mongodb://") &&
    !MONGO_URI.startsWith("mongodb+srv://"))
) {
  console.error(
    "❌ Invalid or missing MONGO_URI. Ensure backend/.env has a valid mongodb:// or mongodb+srv:// value.",
  );
  process.exit(1);
}

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ["GET", "POST"], credentials: true },
});

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// API routes
app.use("/api/auth", authRouter);
app.use("/api/documents", documentRouter);
app.use("/api/media", mediaRouter);

// Setup socket.io
setupSocket(io);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
