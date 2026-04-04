import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import UserModel from '../models/User';
import { signToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const existing = await UserModel.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // Generate unique collabId (short, shareable)
    const collabId = `${username.toLowerCase().replace(/\s+/g, '-')}-${uuidv4().slice(0, 6)}`;

    const user = await UserModel.create({ username, email, password, collabId });

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      collabId: user.collabId,
    });

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email, collabId: user.collabId },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await UserModel.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      collabId: user.collabId,
    });

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, collabId: user.collabId },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
