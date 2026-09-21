import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeCard, authorizeChecklistItem } from '../middleware/access.js';
import { boardIdForCard, broadcast, getFullCard } from '../realtime.js';

// After a checklist mutation, subscribers get the whole card so every client
// converges through the same `card.updated` handling (positions, labels and
// checklist stay consistent without extra round-trips).
async function broadcastCard(cardId: string, actorId: string): Promise<void> {
  const [boardId, card] = await Promise.all([boardIdForCard(cardId), getFullCard(cardId)]);
  if (boardId && card) broadcast(boardId, 'card.updated', card, actorId);
}

const router = Router();

// POST /api/checklist - create a new checklist item for a card
router.post('/', async (req: Request, res: Response) => {
  const { title, cardId } = req.body;
  if (!title || typeof cardId !== 'string') {
    res.status(400).json({ error: 'title and cardId are required' });
    return;
  }
  if (!(await authorizeCard(req, res, cardId, 'edit'))) return;

  // Calculate next position
  const lastItem = await prisma.checklistItem.findFirst({
    where: { cardId },
    orderBy: { position: 'desc' },
  });
  const position = lastItem ? lastItem.position + 1 : 0;

  const item = await prisma.checklistItem.create({
    data: {
      title: title.trim(),
      cardId,
      position,
      completed: false,
    },
  });
  await broadcastCard(cardId, req.userId!);
  res.status(201).json(item);
});

// PATCH /api/checklist/:id - update a checklist item
router.patch('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeChecklistItem(req, res, req.params.id, 'edit'))) return;
  const { title, completed, position } = req.body;
  try {
    const item = await prisma.checklistItem.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(completed !== undefined && { completed: Boolean(completed) }),
        ...(position !== undefined && { position: Number(position) }),
      },
    });
    await broadcastCard(item.cardId, req.userId!);
    res.json(item);
  } catch (error) {
    console.error('Error updating checklist item:', error);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

// DELETE /api/checklist/:id - delete a checklist item
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeChecklistItem(req, res, req.params.id, 'edit'))) return;
  try {
    const doomed = await prisma.checklistItem.findUnique({
      where: { id: req.params.id },
      select: { cardId: true },
    });
    await prisma.checklistItem.delete({
      where: { id: req.params.id },
    });
    if (doomed) await broadcastCard(doomed.cardId, req.userId!);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting checklist item:', error);
    res.status(500).json({ error: 'Failed to delete checklist item' });
  }
});

// POST /api/checklist/reorder - reorder checklist items for a card
router.post('/reorder', async (req: Request, res: Response) => {
  const { cardId, itemIds } = req.body;
  if (typeof cardId !== 'string' || !Array.isArray(itemIds)) {
    res.status(400).json({ error: 'cardId and itemIds array are required' });
    return;
  }
  if (!(await authorizeCard(req, res, cardId, 'edit'))) return;

  try {
    await prisma.$transaction(
      itemIds.map((id: string, index: number) =>
        prisma.checklistItem.update({
          where: { id, cardId },
          data: { position: index },
        })
      )
    );

    const updatedItems = await prisma.checklistItem.findMany({
      where: { cardId },
      orderBy: { position: 'asc' },
    });
    await broadcastCard(cardId, req.userId!);
    res.json(updatedItems);
  } catch (error) {
    console.error('Error reordering checklist items:', error);
    res.status(500).json({ error: 'Failed to reorder checklist items' });
  }
});

export default router;
