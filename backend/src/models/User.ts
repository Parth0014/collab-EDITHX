import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  collabId: string;
  avatar: string;
  activeSessionId?: string;
  activeSessionLastSeenAt?: Date;
  pendingLoginAttemptCount: number;
  pendingLoginBlockedUntil?: Date;
  tokenVersion: number;
  pendingLogin?: {
    requestId: string;
    newSessionId: string;
    deviceInfo: string;
    status: "pending" | "approved" | "denied";
    requestedAt: Date;
    expiresAt: Date;
  };
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    collabId: { type: String, required: true, unique: true },
    avatar: { type: String, default: "" },
    activeSessionId: { type: String, default: null },
    activeSessionLastSeenAt: { type: Date, default: null },
    pendingLoginAttemptCount: { type: Number, default: 0 },
    pendingLoginBlockedUntil: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    pendingLogin: {
      requestId: { type: String },
      newSessionId: { type: String },
      deviceInfo: { type: String },
      status: { type: String, enum: ["pending", "approved", "denied"] },
      requestedAt: { type: Date },
      expiresAt: { type: Date },
    },
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
