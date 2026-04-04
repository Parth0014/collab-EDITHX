import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  collabId: string;
  avatar: string;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  username:  { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  collabId:  { type: String, required: true, unique: true },
  avatar:    { type: String, default: '' },
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
