import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import DocumentModel from "../models/Document";
import UserModel from "../models/User";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/documents  — list all docs user owns or collaborates on
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const docs = await DocumentModel.find({
      $or: [{ owner: userId }, { "collaborators.userId": userId }],
    }).select(
      "docId title owner ownerUsername collaborators updatedAt createdAt",
    );
    res.json(docs);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/documents  — create new document
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { title } = req.body;
    const docId = uuidv4();
    const doc = await DocumentModel.create({
      docId,
      title: title || "Untitled Document",
      owner: req.user!.userId,
      ownerUsername: req.user!.username,
      collaborators: [],
      invitations: [],
      mediaAssets: [],
      externalTasks: [],
    });
    res.status(201).json(doc);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/documents/:docId  — get document (must be member or owner)
router.get("/:docId", async (req: AuthRequest, res: Response) => {
  try {
    const doc = await DocumentModel.findOne({ docId: req.params.docId });
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const userId = req.user!.userId;
    const isOwner = doc.owner.toString() === userId;
    const collab = doc.collaborators.find(
      (c) => c.userId.toString() === userId,
    );
    if (!isOwner && !collab)
      return res.status(403).json({ error: "Access denied" });

    res.json({
      docId: doc.docId,
      title: doc.title,
      content: doc.content,
      owner: doc.owner,
      ownerUsername: doc.ownerUsername,
      collaborators: doc.collaborators,
      invitations: doc.invitations,
      mediaAssets: doc.mediaAssets,
      externalTasks: doc.externalTasks,
      accessLevel: isOwner ? "owner" : collab!.accessLevel,
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/documents/:docId/title  — update title (owner/editor only)
router.put("/:docId/title", async (req: AuthRequest, res: Response) => {
  try {
    const { title } = req.body;
    const doc = await DocumentModel.findOne({ docId: req.params.docId });
    if (!doc) return res.status(404).json({ error: "Not found" });

    const userId = req.user!.userId;
    const isOwner = doc.owner.toString() === userId;
    const isEditor = doc.collaborators.some(
      (c) => c.userId.toString() === userId && c.accessLevel === "edit",
    );
    if (!isOwner && !isEditor)
      return res.status(403).json({ error: "Access denied" });

    doc.title = title;
    await doc.save();
    res.json({ ok: true, title });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/documents/:docId/invite  — owner invites user by collabId
router.post("/:docId/invite", async (req: AuthRequest, res: Response) => {
  try {
    const { collabId, accessLevel } = req.body;
    const doc = await DocumentModel.findOne({ docId: req.params.docId });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.owner.toString() !== req.user!.userId) {
      return res.status(403).json({ error: "Only the owner can invite" });
    }

    // Validate invitee exists
    const invitee = await UserModel.findOne({ collabId });
    if (!invitee)
      return res
        .status(404)
        .json({ error: "User with that collabId not found" });

    // Check not already a collaborator
    if (doc.collaborators.some((c) => c.collabId === collabId)) {
      return res.status(409).json({ error: "User is already a collaborator" });
    }

    // Check not already invited
    const existing = doc.invitations.find(
      (i) => i.inviteeCollabId === collabId && i.status === "pending",
    );
    if (existing)
      return res.status(409).json({ error: "Invitation already pending" });

    doc.invitations.push({
      inviteeCollabId: collabId,
      accessLevel: accessLevel || "edit",
      status: "pending",
      createdAt: new Date(),
    });
    await doc.save();

    res.json({ ok: true, message: `Invitation sent to ${invitee.username}` });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/documents/invitations/me  — get all pending invitations for current user
router.get("/invitations/me", async (req: AuthRequest, res: Response) => {
  try {
    const userCollabId = req.user!.collabId;
    const docs = await DocumentModel.find({
      "invitations.inviteeCollabId": userCollabId,
      "invitations.status": "pending",
    }).select("docId title ownerUsername invitations");

    const result = docs.map((doc) => {
      const inv = doc.invitations.find(
        (i) => i.inviteeCollabId === userCollabId && i.status === "pending",
      );
      return {
        docId: doc.docId,
        title: doc.title,
        ownerUsername: doc.ownerUsername,
        accessLevel: inv!.accessLevel,
        createdAt: inv!.createdAt,
      };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/documents/:docId/invitations/respond  — accept or reject
router.post(
  "/:docId/invitations/respond",
  async (req: AuthRequest, res: Response) => {
    try {
      const { action } = req.body; // 'accept' | 'reject'
      const userCollabId = req.user!.collabId;
      const doc = await DocumentModel.findOne({ docId: req.params.docId });
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const inv = doc.invitations.find(
        (i) => i.inviteeCollabId === userCollabId && i.status === "pending",
      );
      if (!inv) return res.status(404).json({ error: "Invitation not found" });

      if (action === "accept") {
        inv.status = "accepted";
        const invitee = await UserModel.findOne({ collabId: userCollabId });
        doc.collaborators.push({
          userId: invitee!._id as any,
          collabId: userCollabId,
          username: invitee!.username,
          accessLevel: inv.accessLevel,
          joinedAt: new Date(),
        });
      } else {
        inv.status = "rejected";
      }

      await doc.save();
      res.json({ ok: true, action });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// PUT /api/documents/:docId/collaborators/:collabId/access  — owner changes access level
router.put(
  "/:docId/collaborators/:collabId/access",
  async (req: AuthRequest, res: Response) => {
    try {
      const { accessLevel } = req.body;
      const doc = await DocumentModel.findOne({ docId: req.params.docId });
      if (!doc) return res.status(404).json({ error: "Not found" });
      if (doc.owner.toString() !== req.user!.userId) {
        return res.status(403).json({ error: "Only owner can change access" });
      }

      const collab = doc.collaborators.find(
        (c) => c.collabId === req.params.collabId,
      );
      if (!collab)
        return res.status(404).json({ error: "Collaborator not found" });

      collab.accessLevel = accessLevel;
      await doc.save();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// DELETE /api/documents/:docId/collaborators/:collabId  — owner revokes or user leaves
router.delete(
  "/:docId/collaborators/:collabId",
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = await DocumentModel.findOne({ docId: req.params.docId });
      if (!doc) return res.status(404).json({ error: "Not found" });

      const targetCollab = doc.collaborators.find(
        (c) => c.collabId === req.params.collabId,
      );
      if (!targetCollab)
        return res.status(404).json({ error: "Collaborator not found" });

      const isOwner = doc.owner.toString() === req.user!.userId;
      const isRemovingSelf =
        targetCollab.userId.toString() === req.user!.userId;

      // Allow owner to remove anyone, or user to remove themselves
      if (!isOwner && !isRemovingSelf) {
        return res.status(403).json({
          error: "Only owner can revoke access or you can remove yourself",
        });
      }

      doc.collaborators = doc.collaborators.filter(
        (c) => c.collabId !== req.params.collabId,
      );
      await doc.save();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// DELETE /api/documents/:docId  — owner deletes document
router.delete("/:docId", async (req: AuthRequest, res: Response) => {
  try {
    const doc = await DocumentModel.findOne({ docId: req.params.docId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (doc.owner.toString() !== req.user!.userId) {
      return res.status(403).json({ error: "Only owner can delete" });
    }
    await doc.deleteOne();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
