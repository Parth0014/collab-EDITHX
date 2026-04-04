import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IPendingLogin {
  requestId: string;
  newSessionId: string;
  deviceInfo: string;
  status: "pending" | "approved" | "denied";
  requestedAt: Date;
  expiresAt: Date;
}

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  collabId: string;
  avatar: string;
  // Session tracking
  activeSessionId?: string;
  activeSessionLastSeenAt?: Date;
  tokenVersion: number;
  // Pending login approval (only one can exist at a time)
  pendingLogin?: IPendingLogin;
  // Rate limiting (mutually exclusive with pendingLogin)
  loginAttemptCount: number;
  loginBlockedUntil?: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const PendingLoginSchema = new Schema<IPendingLogin>(
  {
    requestId: { type: String, required: true },
    newSessionId: { type: String, required: true },
    deviceInfo: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending",
    },
    requestedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    collabId: { type: String, required: true, unique: true },
    avatar: { type: String, default: "" },
    activeSessionId: { type: String, default: null },
    activeSessionLastSeenAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    pendingLogin: { type: PendingLoginSchema, default: undefined },
    // Renamed from pendingLoginAttemptCount / pendingLoginBlockedUntil
    // to make the purpose clear: these are for rate-limiting login attempts
    loginAttemptCount: { type: Number, default: 0 },
    loginBlockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
