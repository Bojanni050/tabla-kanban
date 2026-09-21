import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /api/workspaces - list workspaces for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  const workspaces = await prisma.workspace.findMany({
    where: { userId: req.userId },
    include: {
      boards: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(workspaces);
});

// GET /api/workspaces/:id
router.get('/:id', async (req: Request, res: Response) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
    include: { boards: true },
  });
  if (!workspace || workspace.userId !== req.userId) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(workspace);
});

// POST /api/workspaces
router.post('/', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const workspace = await prisma.workspace.create({
    data: { name, userId: req.userId! },
  });
  res.status(201).json(workspace);
});

export default router;
