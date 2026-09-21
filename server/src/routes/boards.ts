import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, authorizeWorkspace, parseName } from '../middleware/ownership.js';

const router = Router();

// GET /api/boards - list boards in the authenticated user's workspaces
router.get('/', async (req: Request, res: Response) => {
  const boards = await prisma.board.findMany({
    where: { workspace: { userId: req.userId } },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(boards);
});

// GET /api/boards/:id - get a board with its lists, cards, and labels
router.get('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id))) return;
  const board = await prisma.board.findUnique({
    where: { id: req.params.id },
    include: {
      labels: {
        orderBy: { createdAt: 'asc' },
      },
      lists: {
        include: {
          cards: {
            where: { archived: false },
            include: {
              labels: true,
              checklistItems: {
                orderBy: { position: 'asc' },
              },
            },
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

// GET /api/boards/:id/archived - get all archived cards for a board
router.get('/:id/archived', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id))) return;
  try {
    const archivedCards = await prisma.card.findMany({
      where: {
        archived: true,
        list: { boardId: req.params.id },
      },
      include: {
        labels: true,
        checklistItems: {
          orderBy: { position: 'asc' },
        },
        list: {
          select: { id: true, title: true, boardId: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(archivedCards);
  } catch (error) {
    console.error('Error fetching archived cards:', error);
    res.status(500).json({ error: 'Failed to fetch archived cards' });
  }
});

// POST /api/boards
router.post('/', async (req: Request, res: Response) => {
  const name = parseName(req.body?.name);
  const workspaceId = req.body?.workspaceId;
  if (!name || typeof workspaceId !== 'string') {
    res.status(400).json({ error: 'name and workspaceId are required' });
    return;
  }
  if (!(await authorizeWorkspace(req, res, workspaceId))) return;
  const board = await prisma.board.create({
    data: { name, workspaceId },
  });
  res.status(201).json(board);
});

// PATCH /api/boards/:id
router.patch('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id))) return;
  const name = parseName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'name is required (max 100 characters)' });
    return;
  }
  const board = await prisma.board.update({
    where: { id: req.params.id },
    data: { name },
  });
  res.json(board);
});

// DELETE /api/boards/:id
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id))) return;
  await prisma.board.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
