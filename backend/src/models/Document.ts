import mongoose, { Schema, Document } from 'mongoose';

export type AccessLevel = 'view' | 'edit';

export interface ICollaborator {
  userId: mongoose.Types.ObjectId;
  collabId: string;
  username: string;
  accessLevel: AccessLevel;
  joinedAt: Date;
}

export interface IInvitation {
  inviteeCollabId: string;
  accessLevel: AccessLevel;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface IMediaAsset {
  id: string;
  type: 'image' | 'pdf';
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

export interface IDocument extends Document {
  docId: string;
  title: string;
  content: string;
  owner: mongoose.Types.ObjectId;
  ownerUsername: string;
  collaborators: ICollaborator[];
  invitations: IInvitation[];
  mediaAssets: IMediaAsset[];
  updatedAt: Date;
}

const CollaboratorSchema = new Schema<ICollaborator>({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  collabId:    { type: String, required: true },
  username:    { type: String, required: true },
  accessLevel: { type: String, enum: ['view', 'edit'], default: 'edit' },
  joinedAt:    { type: Date, default: Date.now },
});

const InvitationSchema = new Schema<IInvitation>({
  inviteeCollabId: { type: String, required: true },
  accessLevel:     { type: String, enum: ['view', 'edit'], default: 'edit' },
  status:          { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt:       { type: Date, default: Date.now },
});

const MediaAssetSchema = new Schema<IMediaAsset>({
  id:           { type: String, required: true },
  type:         { type: String, enum: ['image', 'pdf'], required: true },
  filename:     { type: String, required: true },
  originalName: { type: String, required: true },
  mimetype:     { type: String, required: true },
  size:         { type: Number, required: true },
  url:          { type: String, required: true },
  uploadedBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt:   { type: Date, default: Date.now },
});

const DocumentSchema = new Schema<IDocument>({
  docId:          { type: String, required: true, unique: true },
  title:          { type: String, default: 'Untitled Document' },
  content:        { type: String, default: '' },
  owner:          { type: Schema.Types.ObjectId, ref: 'User', required: true },
  ownerUsername:  { type: String, required: true },
  collaborators:  [CollaboratorSchema],
  invitations:    [InvitationSchema],
  mediaAssets:    [MediaAssetSchema],
}, { timestamps: true });

export default mongoose.model<IDocument>('Document', DocumentSchema);
