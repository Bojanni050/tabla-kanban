import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /api/boards - list all boards
router.get('/', async (_req: Request, res: Response) => {
  const boards = await prisma.board.findMany({
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(boards);
});

// GET /api/boards/:id - get a board with its lists and cards
router.get('/:id', async (req: Request, res: Response) => {
  const board = await prisma.board.findUnique({
    where: { id: req.params.id },
    include: {
      lists: {
        include: {
          cards: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      },
      workspace: true,
    },
  });
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  res.json(board);
});

// POST /api/boards
router.post('/', async (req: Request, res: Response) => {
  const { name, workspaceId } = req.body;
  if (!name || !workspaceId) {
    res.status(400).json({ error: 'name and workspaceId are required' });
    return;
  }
  const board = await prisma.board.create({
    data: { name, workspaceId },
  });
  res.status(201).json(board);
});

// PATCH /api/boards/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { name } = req.body;
  const board = await prisma.board.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }) },
  });
  res.json(board);
});

// DELETE /api/boards/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.board.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
