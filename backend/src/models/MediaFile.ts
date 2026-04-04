import mongoose, { Schema, Document } from "mongoose";

export interface IMediaFile extends Document {
  assetId: string;
  docId: string;
  mimetype: string;
  originalName: string;
  size: number;
  data: Buffer;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MediaFileSchema = new Schema<IMediaFile>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    docId: { type: String, required: true, index: true },
    mimetype: { type: String, required: true },
    originalName: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export default mongoose.model<IMediaFile>("MediaFile", MediaFileSchema);
