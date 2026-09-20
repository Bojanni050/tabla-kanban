import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// POST /api/lists
router.post('/', async (req: Request, res: Response) => {
  const { title, boardId } = req.body;
  if (!title || !boardId) {
    res.status(400).json({ error: 'title and boardId are required' });
    return;
  }

  // Calculate next position
  const lastList = await prisma.list.findFirst({
    where: { boardId },
    orderBy: { position: 'desc' },
  });
  const position = lastList ? lastList.position + 1 : 0;

  const list = await prisma.list.create({
    data: { title, boardId, position },
    include: { cards: { orderBy: { position: 'asc' } } },
  });
  res.status(201).json(list);
});

// PATCH /api/lists/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { title, position } = req.body;
  const list = await prisma.list.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(position !== undefined && { position }),
    },
    include: { cards: { orderBy: { position: 'asc' } } },
  });
  res.json(list);
});

// DELETE /api/lists/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.list.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
