import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, authorizeWorkspace, parseName } from '../middleware/access.js';

const router = Router();

// GET /api/boards - list every board the authenticated user is a member of
router.get('/', async (req: Request, res: Response) => {
  const boards = await prisma.board.findMany({
    where: { members: { some: { userId: req.userId } } },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(boards);
});

// GET /api/boards/shared - boards the user belongs to but does not own
router.get('/shared', async (req: Request, res: Response) => {
  const memberships = await prisma.boardMember.findMany({
    where: { userId: req.userId, role: { not: 'OWNER' } },
    include: {
      board: {
        include: {
          members: {
            where: { role: 'OWNER' },
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(
    memberships.map((m) => ({
      id: m.board.id,
      name: m.board.name,
      workspaceId: m.board.workspaceId,
      role: m.role,
      owner: m.board.members[0]?.user ?? null,
    }))
  );
});

// GET /api/boards/:id - get a board with its lists, cards, and labels
router.get('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id, 'view'))) return;
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
  res.json({ ...board, myRole: req.boardRole });
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
  // The creator becomes the board's owner
  const board = await prisma.board.create({
    data: { name, workspaceId, members: { create: { userId: req.userId!, role: 'OWNER' } } },
  });
  res.status(201).json(board);
});

// PATCH /api/boards/:id
router.patch('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id, 'manage'))) return;
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
  if (!(await authorizeBoard(req, res, req.params.id, 'owner'))) return;
  await prisma.board.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
