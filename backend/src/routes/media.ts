import { Router, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import DocumentModel from "../models/Document";
import MediaFileModel from "../models/MediaFile";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images (JPEG/PNG/GIF/WEBP) and PDFs are allowed"));
  },
});

// Public file stream endpoint (same exposure model as previous /uploads static files)
router.get("/file/:assetId", async (req, res: Response) => {
  try {
    const file = await MediaFileModel.findOne({ assetId: req.params.assetId });
    if (!file) return res.status(404).json({ error: "File not found" });

    res.setHeader("Content-Type", file.mimetype);
    res.setHeader("Content-Length", file.size.toString());
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(file.data);
  } catch {
    res.status(500).json({ error: "Failed to load file" });
  }
});

router.use(authMiddleware);

// POST /api/media/:docId  — upload image or PDF to a document
router.post(
  "/:docId",
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const doc = await DocumentModel.findOne({ docId: req.params.docId });
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const userId = req.user!.userId;
      const isOwner = doc.owner.toString() === userId;
      const isEditor = doc.collaborators.some(
        (c) => c.userId.toString() === userId && c.accessLevel === "edit",
      );
      if (!isOwner && !isEditor)
        return res.status(403).json({ error: "No edit access" });

      const fileType =
        req.file.mimetype === "application/pdf" ? "pdf" : "image";
      const assetId = uuidv4();

      await MediaFileModel.create({
        assetId,
        docId: req.params.docId,
        mimetype: req.file.mimetype,
        originalName: req.file.originalname,
        size: req.file.size,
        data: req.file.buffer,
        uploadedBy: req.user!.userId as any,
      });

      const fileUrl = `/api/media/file/${assetId}`;

      const asset = {
        id: assetId,
        type: fileType as "image" | "pdf",
        filename: assetId,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
        uploadedBy: req.user!.userId as any,
        uploadedAt: new Date(),
      };

      doc.mediaAssets.push(asset);
      await doc.save();

      res.status(201).json({ ok: true, asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  },
);

// DELETE /api/media/:docId/:assetId  — remove a media asset
router.delete("/:docId/:assetId", async (req: AuthRequest, res: Response) => {
  try {
    const doc = await DocumentModel.findOne({ docId: req.params.docId });
    if (!doc) return res.status(404).json({ error: "Not found" });

    const userId = req.user!.userId;
    const isOwner = doc.owner.toString() === userId;
    if (!isOwner)
      return res.status(403).json({ error: "Only owner can delete media" });

    const asset = doc.mediaAssets.find((a) => a.id === req.params.assetId);
    if (!asset) return res.status(404).json({ error: "Asset not found" });

    await MediaFileModel.deleteOne({ assetId: asset.id });

    doc.mediaAssets = doc.mediaAssets.filter(
      (a) => a.id !== req.params.assetId,
    );
    await doc.save();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
