export interface User {
  id: string;
  username: string;
  email: string;
  collabId: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

export type AccessLevel = "view" | "edit" | "owner";

export interface Collaborator {
  userId: string;
  collabId: string;
  username: string;
  accessLevel: "view" | "edit";
  joinedAt: string;
}

export interface Invitation {
  inviteeCollabId: string;
  accessLevel: "view" | "edit";
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  type: "image" | "pdf";
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface Document {
  docId: string;
  title: string;
  content: string;
  owner: string;
  ownerUsername: string;
  collaborators: Collaborator[];
  invitations: Invitation[];
  mediaAssets: MediaAsset[];
  accessLevel: AccessLevel;
  updatedAt: string;
  createdAt: string;
}

export interface PendingInvitation {
  docId: string;
  title: string;
  ownerUsername: string;
  accessLevel: "view" | "edit";
  createdAt: string;
}

export interface RoomUser {
  username: string;
  collabId: string;
  color: string;
  userId: string;
}

export interface PendingLoginRequest {
  requestId: string;
  deviceInfo: string;
  requestedAt: string;
}
