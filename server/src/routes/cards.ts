import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { authorizeCard, authorizeLabel, authorizeList } from '../middleware/access.js';
import { broadcast } from '../realtime.js';

const router = Router();

// GET /api/cards/:id
router.get('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id))) return;
  const card = await prisma.card.findUnique({
    where: { id: req.params.id },
    include: cardInclude,
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
  if (!title || typeof listId !== 'string') {
    res.status(400).json({ error: 'title and listId are required' });
    return;
  }
  if (!(await authorizeList(req, res, listId, 'edit'))) return;

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
    include: cardInclude,
  });
  broadcast(card.list.boardId, 'card.created', card, req.userId!);
  res.status(201).json(card);
});

// A card always ships with its assignee, activity and nested relations.
const cardInclude = {
  labels: true,
  checklistItems: {
    orderBy: { position: 'asc' },
  },
  assignee: {
    select: { id: true, name: true, email: true },
  },
  activities: {
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
  list: {
    select: { id: true, title: true, boardId: true },
  },
} as const;

const createActivity = (
  cardId: string,
  actorId: string,
  type: string,
  metadata?: Prisma.InputJsonValue
) =>
  prisma.cardActivity.create({
    data: { cardId, actorId, type, ...(metadata && { metadata }) },
  });

// PATCH /api/cards/:id
router.patch('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id, 'edit'))) return;
  const { title, description, position, listId, priority, dueDate, archived, assigneeId } = req.body;
  if (listId !== undefined) {
    if (typeof listId !== 'string') {
      res.status(400).json({ error: 'Invalid listId' });
      return;
    }
    if (!(await authorizeList(req, res, listId, 'edit'))) return;
  }

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

  // An assignee must be a member of the board the card belongs to.
  let validatedAssigneeId: string | null | undefined = undefined;
  if (assigneeId !== undefined) {
    if (assigneeId === null || assigneeId === '') {
      validatedAssigneeId = null;
    } else if (typeof assigneeId === 'string') {
      const card = await prisma.card.findUnique({
        where: { id: req.params.id },
        select: { list: { select: { boardId: true } } },
      });
      const membership = card
        ? await prisma.boardMember.findUnique({
            where: { boardId_userId: { boardId: card.list.boardId, userId: assigneeId } },
          })
        : null;
      if (!membership) {
        res.status(400).json({ error: 'Assignee must be a member of this board' });
        return;
      }
      validatedAssigneeId = assigneeId;
    } else {
      res.status(400).json({ error: 'Invalid assigneeId' });
      return;
    }
  }
  try {
    const before = validatedAssigneeId !== undefined
      ? await prisma.card.findUnique({ where: { id: req.params.id }, select: { assigneeId: true } })
      : null;
    // Record assignment changes in the activity history before the update,
    // so the updated card ships with its new activity entry.
    if (validatedAssigneeId !== undefined && before && before.assigneeId !== validatedAssigneeId) {
      const assignee = validatedAssigneeId
        ? await prisma.user.findUnique({
            where: { id: validatedAssigneeId },
            select: { name: true, email: true },
          })
        : null;
      const type = !before.assigneeId ? 'card.assigned' : !validatedAssigneeId ? 'card.unassigned' : 'card.reassigned';
      const actor = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { name: true, email: true },
      });
      await createActivity(req.params.id, req.userId!, type, {
        ...(assignee && { assigneeId: validatedAssigneeId, assigneeName: assignee.name ?? assignee.email }),
        ...(actor && { actorName: actor.name ?? actor.email }),
      });
    }
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
        ...(validatedAssigneeId !== undefined && { assigneeId: validatedAssigneeId }),
      },
      include: cardInclude,
    });
    broadcast(card.list.boardId, 'card.updated', card, req.userId!);
    res.json(card);
  } catch (error) {
    console.error('Error updating card:', error);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// POST /api/cards/:id/archive - archive a card
router.post('/:id/archive', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id, 'edit'))) return;
  try {
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: { archived: true },
      include: cardInclude,
    });
    broadcast(card.list.boardId, 'card.archived', card, req.userId!);
    res.json(card);
  } catch (error) {
    console.error('Error archiving card:', error);
    res.status(500).json({ error: 'Failed to archive card' });
  }
});

// POST /api/cards/:id/restore - restore an archived card to the end of its list
router.post('/:id/restore', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id, 'edit'))) return;
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
      include: cardInclude,
    });
    broadcast(restoredCard.list.boardId, 'card.restored', restoredCard, req.userId!);
    res.json(restoredCard);
  } catch (error) {
    console.error('Error restoring card:', error);
    res.status(500).json({ error: 'Failed to restore card' });
  }
});

// POST /api/cards/:id/labels - attach a label to a card
router.post('/:id/labels', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id, 'edit'))) return;
  const { labelId } = req.body;
  if (typeof labelId !== 'string' || !labelId) {
    res.status(400).json({ error: 'labelId is required' });
    return;
  }
  if (!(await authorizeLabel(req, res, labelId, 'edit'))) return;

  // A label may only be attached to cards on its own board
  const [card, label] = await Promise.all([
    prisma.card.findUnique({ where: { id: req.params.id }, select: { list: { select: { boardId: true } } } }),
    prisma.label.findUnique({ where: { id: labelId }, select: { boardId: true } }),
  ]);
  if (!card || !label || card.list.boardId !== label.boardId) {
    res.status(400).json({ error: 'Label does not belong to the same board as this card' });
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
      include: cardInclude,
    });
    broadcast(card.list.boardId, 'card.updated', card, req.userId!);
    res.json(card);
  } catch (error) {
    console.error('Error attaching label to card:', error);
    res.status(500).json({ error: 'Failed to attach label to card' });
  }
});

// DELETE /api/cards/:id/labels/:labelId - remove a label from a card
router.delete('/:id/labels/:labelId', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id, 'edit'))) return;
  try {
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        labels: {
          disconnect: { id: req.params.labelId },
        },
      },
      include: cardInclude,
    });
    broadcast(card.list.boardId, 'card.updated', card, req.userId!);
    res.json(card);
  } catch (error) {
    console.error('Error removing label from card:', error);
    res.status(500).json({ error: 'Failed to remove label from card' });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeCard(req, res, req.params.id, 'edit'))) return;
  const doomed = await prisma.card.findUnique({
    where: { id: req.params.id },
    select: { listId: true, list: { select: { boardId: true } } },
  });
  await prisma.card.delete({ where: { id: req.params.id } });
  if (doomed) {
    broadcast(
      doomed.list.boardId,
      'card.deleted',
      { cardId: req.params.id, listId: doomed.listId, boardId: doomed.list.boardId },
      req.userId!
    );
  }
  res.status(204).send();
});

export default router;
