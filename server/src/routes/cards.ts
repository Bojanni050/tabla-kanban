import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// POST /api/cards
router.post('/', async (req: Request, res: Response) => {
  const { title, listId, description } = req.body;
  if (!title || !listId) {
    res.status(400).json({ error: 'title and listId are required' });
    return;
  }

  // Calculate next position
  const lastCard = await prisma.card.findFirst({
    where: { listId },
    orderBy: { position: 'desc' },
  });
  const position = lastCard ? lastCard.position + 1 : 0;

  const card = await prisma.card.create({
    data: { title, listId, description, position },
  });
  res.status(201).json(card);
});

// PATCH /api/cards/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { title, description, position, listId } = req.body;
  const card = await prisma.card.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(position !== undefined && { position }),
      ...(listId !== undefined && { listId }),
    },
  });
  res.json(card);
});

// DELETE /api/cards/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.card.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
