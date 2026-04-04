# ✏️ CollabEdit — Real-Time Collaborative Document Editor

A full-stack collaborative document editor with real-time sync, rich text, media support, and fine-grained access control.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Rich Text | Tiptap (ProseMirror) |
| Real-time sync | Yjs (CRDT) + Socket.IO |
| Backend | Node.js + TypeScript + Express |
| Database | MongoDB + Mongoose |
| Auth | JWT (JSON Web Tokens) |
| File uploads | Multer |

---

## Features

- **JWT Authentication** — register/login, unique CollabID per user
- **Document management** — create, list, delete documents
- **Invitation system** — owner invites by CollabID, users accept/reject
- **Real-time access control** — owner can change access (edit/view) or revoke in real-time via Socket.IO
- **Rich text editor** — Tiptap with headings, bold/italic/underline, lists, task lists, code blocks, links, text color
- **Collaborative cursors** — see other users' cursors with colored labels
- **Yjs CRDT** — conflict-free real-time sync via binary deltas (not full document)
- **Image upload** — drag/resize/reposition images in the document (Word-like)
- **PDF upload** — widget with view-in-new-tab button
- **Auto-save** — every Yjs update is persisted to MongoDB
- **Active users** — see who's currently in the document

---

## Project Structure

```
collab-editor/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express + Socket.IO server entry
│   │   ├── models/
│   │   │   ├── User.ts           # User model (collabId, password hash)
│   │   │   └── Document.ts       # Document model (collaborators, invitations, media)
│   │   ├── routes/
│   │   │   ├── auth.ts           # POST /api/auth/register, /api/auth/login
│   │   │   ├── document.ts       # CRUD + invite + access control endpoints
│   │   │   └── media.ts          # File upload/delete endpoints
│   │   ├── middleware/
│   │   │   └── auth.ts           # JWT middleware + signToken
│   │   └── socket/
│   │       └── socketHandler.ts  # All Socket.IO events
│   ├── uploads/                  # Uploaded files (auto-created)
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               # Root router
│   │   ├── styles.css            # Global styles + Tiptap overrides
│   │   ├── context/
│   │   │   └── AuthContext.tsx   # Auth state (token, user, login, logout)
│   │   ├── utils/
│   │   │   └── api.ts            # Axios instance
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript interfaces
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx      # Login / Register
│   │   │   ├── Dashboard.tsx     # Document list + pending invitations
│   │   │   └── EditorPage.tsx    # Full editor page with panels
│   │   └── components/
│   │       ├── CollabEditor.tsx  # Tiptap + Yjs + Socket.IO integration
│   │       ├── Toolbar.tsx       # Rich text formatting toolbar
│   │       ├── MembersPanel.tsx  # Invite, change access, revoke
│   │       ├── MediaPanel.tsx    # Upload images/PDFs, insert into doc
│   │       └── DraggableImage.tsx # Draggable + resizable image wrapper
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── docker-compose.yml            # MongoDB via Docker
└── README.md
```

---

## Quick Start

### 1. Start MongoDB

**Option A — Docker (recommended):**
```bash
docker-compose up -d
```

**Option B — Local MongoDB:**
```bash
mongod --dbpath ~/data/db
```

### 2. Backend

```bash
cd backend
npm install
# Copy .env and adjust if needed
npm run dev
```

Backend runs on `http://localhost:4000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## How to Use

### Register & CollabID
1. Open `http://localhost:5173`
2. Create an account — you'll get a unique **CollabID** like `alice-a1b2c3`
3. Share your CollabID with others so they can invite you

### Create a Document
1. Click **+ New Document** on the dashboard
2. The editor opens automatically

### Invite Collaborators (Owner only)
1. Open a document → click **👥 Members**
2. Enter the invitee's CollabID
3. Choose **Can edit** or **Can view**
4. Click **Send Invitation**

### Accept/Reject Invitations
1. Pending invitations appear at the top of the Dashboard
2. Click **Accept** or **Decline**

### Change Access / Revoke (Owner only)
- In the Members panel, use the dropdown to switch between **Edit** / **View**
- Click **✕** to revoke access — takes effect in real time

### Upload Images
1. Click **📎 Media** → drop or select an image file
2. Click the thumbnail to insert it into the document
3. In the document: drag it anywhere, drag the blue corner handle to resize

### Upload PDFs
1. Click **📎 Media** → upload a PDF file
2. A widget appears with a **View PDF ↗** button that opens in a new tab

---

## API Reference

### Auth
| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{username, email, password}` | Register, returns token + collabId |
| POST | `/api/auth/login` | `{email, password}` | Login, returns token |

### Documents
All document routes require `Authorization: Bearer <token>`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/documents` | List all documents (owned + shared) |
| POST | `/api/documents` | Create new document |
| GET | `/api/documents/:docId` | Get document (access verified) |
| PUT | `/api/documents/:docId/title` | Update title |
| DELETE | `/api/documents/:docId` | Delete (owner only) |
| POST | `/api/documents/:docId/invite` | Invite user by collabId |
| GET | `/api/documents/invitations/me` | Get pending invitations for current user |
| POST | `/api/documents/:docId/invitations/respond` | Accept or reject invitation |
| PUT | `/api/documents/:docId/collaborators/:collabId/access` | Change access level |
| DELETE | `/api/documents/:docId/collaborators/:collabId` | Revoke access |

### Media
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/media/:docId` | Upload image or PDF (multipart/form-data) |
| DELETE | `/api/media/:docId/:assetId` | Delete media asset (owner only) |

### Socket.IO Events
| Event | Direction | Payload | Description |
|---|---|---|---|
| `join-document` | Client → Server | `{docId}` | Join a document room |
| `load-document` | Server → Client | `{state, accessLevel, color}` | Initial Yjs state |
| `send-changes` | Client → Server | `{docId, update}` | Yjs binary delta (base64) |
| `receive-changes` | Server → Client | base64 string | Yjs delta from another user |
| `cursor-update` | Client → Server | `{docId, cursor}` | Cursor position |
| `cursor-update` | Server → Client | `{userId, username, color, cursor}` | Another user's cursor |
| `room-users` | Server → Client | `RoomUser[]` | Updated list of active users |
| `access-changed` | Both | `{collabId, accessLevel}` | Owner changed someone's access |
| `access-revoked` | Both | `{collabId}` | Owner revoked someone's access |
| `title-changed` | Both | string | Document title was updated |
| `media-added` | Both | `MediaAsset` | New file was uploaded |

---

## Environment Variables

**Backend `.env`:**
```
MONGO_URI=mongodb://localhost:27017/collab-editor
JWT_SECRET=your_long_random_secret_here
PORT=4000
FRONTEND_URL=http://localhost:5173
```

---

## Production Deployment Notes

1. Change `JWT_SECRET` to a long random string
2. Set `MONGO_URI` to your cloud MongoDB (Atlas) URI
3. Update `FRONTEND_URL` to your production domain
4. Update `SOCKET_URL` and `API_BASE` in `frontend/src/utils/api.ts`
5. Use a reverse proxy (Nginx) to serve both backend and frontend
6. Store uploaded files on S3/Cloudinary instead of local disk for multi-server setups
