import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeWorkspace, parseName } from '../middleware/access.js';

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
  if (!(await authorizeWorkspace(req, res, req.params.id))) return;
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
    include: { boards: { orderBy: { createdAt: 'asc' } } },
  });
  res.json(workspace);
});

// POST /api/workspaces
router.post('/', async (req: Request, res: Response) => {
  const name = parseName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'name is required (max 100 characters)' });
    return;
  }
  const workspace = await prisma.workspace.create({
    data: { name, userId: req.userId! },
    include: { boards: true },
  });
  res.status(201).json(workspace);
});

// PATCH /api/workspaces/:id - rename
router.patch('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeWorkspace(req, res, req.params.id))) return;
  const name = parseName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'name is required (max 100 characters)' });
    return;
  }
  const workspace = await prisma.workspace.update({
    where: { id: req.params.id },
    data: { name },
    include: { boards: { orderBy: { createdAt: 'asc' } } },
  });
  res.json(workspace);
});

// DELETE /api/workspaces/:id
// Boards, lists, cards, labels and checklist items are removed by the
// onDelete: Cascade relations in the Prisma schema.
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeWorkspace(req, res, req.params.id))) return;
  await prisma.workspace.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
