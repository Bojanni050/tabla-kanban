import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /api/cards/:id
router.get('/:id', async (req: Request, res: Response) => {
  const card = await prisma.card.findUnique({
    where: { id: req.params.id },
    include: {
      labels: true,
      checklistItems: {
        orderBy: { position: 'asc' },
      },
      list: {
        select: { id: true, title: true, boardId: true },
      },
    },
  });
  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  res.json(card);
});

// POST /api/cards
router.post('/', async (req: Request, res: Response) => {
  const { title, listId, description, priority, dueDate } = req.body;
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

  let validatedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | null = null;
  if (priority) {
    const upper = String(priority).toUpperCase();
    if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH') {
      validatedPriority = upper as 'LOW' | 'MEDIUM' | 'HIGH';
    }
  }

  let validatedDueDate: Date | null = null;
  if (dueDate) {
    const date = new Date(dueDate);
    if (!isNaN(date.getTime())) {
      validatedDueDate = date;
    }
  }

  const card = await prisma.card.create({
    data: {
      title,
      listId,
      description: description ?? null,
      position,
      priority: validatedPriority,
      dueDate: validatedDueDate,
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
  });
  res.status(201).json(card);
});

// PATCH /api/cards/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const { title, description, position, listId, priority, dueDate, archived } = req.body;

  let validatedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | null | undefined = undefined;
  if (priority !== undefined) {
    if (priority === null || priority === '') {
      validatedPriority = null;
    } else {
      const upper = String(priority).toUpperCase();
      if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH') {
        validatedPriority = upper as 'LOW' | 'MEDIUM' | 'HIGH';
      } else {
        res.status(400).json({ error: 'Invalid priority. Must be LOW, MEDIUM, or HIGH' });
        return;
      }
    }
  }

  let validatedDueDate: Date | null | undefined = undefined;
  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === '') {
      validatedDueDate = null;
    } else {
      const date = new Date(dueDate);
      if (isNaN(date.getTime())) {
        res.status(400).json({ error: 'Invalid dueDate format' });
        return;
      }
      validatedDueDate = date;
    }
  }

  try {
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(position !== undefined && { position }),
        ...(listId !== undefined && { listId }),
        ...(validatedPriority !== undefined && { priority: validatedPriority }),
        ...(validatedDueDate !== undefined && { dueDate: validatedDueDate }),
        ...(archived !== undefined && { archived: Boolean(archived) }),
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
    });
    res.json(card);
  } catch (error) {
    console.error('Error updating card:', error);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// POST /api/cards/:id/archive - archive a card
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: { archived: true },
      include: {
        labels: true,
        checklistItems: {
          orderBy: { position: 'asc' },
        },
        list: {
          select: { id: true, title: true, boardId: true },
        },
      },
    });
    res.json(card);
  } catch (error) {
    console.error('Error archiving card:', error);
    res.status(500).json({ error: 'Failed to archive card' });
  }
});

// POST /api/cards/:id/restore - restore an archived card to the end of its list
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const existingCard = await prisma.card.findUnique({
      where: { id: req.params.id },
    });
    if (!existingCard) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    // Find the last position among non-archived cards in this list
    const lastCard = await prisma.card.findFirst({
      where: { listId: existingCard.listId, archived: false },
      orderBy: { position: 'desc' },
    });
    const nextPosition = lastCard ? lastCard.position + 1 : 0;

    const restoredCard = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        archived: false,
        position: nextPosition,
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
    });
    res.json(restoredCard);
  } catch (error) {
    console.error('Error restoring card:', error);
    res.status(500).json({ error: 'Failed to restore card' });
  }
});

// POST /api/cards/:id/labels - attach a label to a card
router.post('/:id/labels', async (req: Request, res: Response) => {
  const { labelId } = req.body;
  if (!labelId) {
    res.status(400).json({ error: 'labelId is required' });
    return;
  }

  try {
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        labels: {
          connect: { id: labelId },
        },
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
    });
    res.json(card);
  } catch (error) {
    console.error('Error attaching label to card:', error);
    res.status(500).json({ error: 'Failed to attach label to card' });
  }
});

// DELETE /api/cards/:id/labels/:labelId - remove a label from a card
router.delete('/:id/labels/:labelId', async (req: Request, res: Response) => {
  try {
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        labels: {
          disconnect: { id: req.params.labelId },
        },
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
    });
    res.json(card);
  } catch (error) {
    console.error('Error removing label from card:', error);
    res.status(500).json({ error: 'Failed to remove label from card' });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.card.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
