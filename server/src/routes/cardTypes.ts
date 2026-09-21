import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, authorizeCardType } from '../middleware/access.js';
import { broadcast } from '../realtime.js';
import type { Prisma } from '@prisma/client';

// Card types: board-level definitions of what a card IS (e.g. Task, Feature, Bug).
// Managing them requires the 'manage' permission (owner/admin); using them on a
// card goes through the regular card-edit routes. They follow the same position
// strategy as swimlanes and are kept strictly separate from labels.

const router = Router();

const logActivity = (
  boardId: string,
  actorId: string,
  type: string,
  metadata: Prisma.InputJsonValue
) =>
  prisma.boardActivity.create({
    data: { boardId, actorId, type, metadata },
  });

// GET /api/card-types/board/:boardId - all card types of a board
router.get('/board/:boardId', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.boardId))) return;
  const cardTypes = await prisma.cardType.findMany({
    where: { boardId: req.params.boardId },
    orderBy: { position: 'asc' },
  });
  res.json(cardTypes);
});

// POST /api/card-types - create a card type at the bottom of the board
router.post('/', async (req: Request, res: Response) => {
  const { name, color, boardId } = req.body;
  if (!name || typeof name !== 'string' || !color || typeof color !== 'string' || typeof boardId !== 'string') {
    res.status(400).json({ error: 'name, color, and boardId are required' });
    return;
  }
  if (!(await authorizeBoard(req, res, boardId, 'manage'))) return;
  const last = await prisma.cardType.findFirst({
    where: { boardId },
    orderBy: { position: 'desc' },
  });
  const position = last ? last.position + 1 : 0;
  const cardType = await prisma.cardType.create({
    data: { name: name.trim(), color: color.trim(), boardId, position },
  });
  await logActivity(boardId, req.userId!, 'card_type.created', {
    cardTypeId: cardType.id,
    cardTypeName: cardType.name,
  });
  broadcast(boardId, 'card_type.created', cardType, req.userId!);
  res.status(201).json(cardType);
});

// PATCH /api/card-types/:id - rename, recolor or reposition a card type
router.patch('/:id', async (req: Request, res: Response) => {
  const { name, color, position } = req.body;
  const existing = await prisma.cardType.findUnique({
    where: { id: req.params.id },
    select: { boardId: true, name: true, color: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Card type not found' });
    return;
  }
  if (!(await authorizeBoard(req, res, existing.boardId, 'manage'))) return;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }
  if (color !== undefined && (typeof color !== 'string' || !color.trim())) {
    res.status(400).json({ error: 'Invalid color' });
    return;
  }
  const cardType = await prisma.cardType.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color: color.trim() }),
      ...(position !== undefined && { position: Number(position) }),
    },
  });
  if (name !== undefined && cardType.name !== existing.name) {
    await logActivity(existing.boardId, req.userId!, 'card_type.renamed', {
      cardTypeId: cardType.id,
      cardTypeName: cardType.name,
      previousName: existing.name,
    });
  }
  if (position !== undefined) {
    await logActivity(existing.boardId, req.userId!, 'card_type.reordered', {
      cardTypeId: cardType.id,
      cardTypeName: cardType.name,
    });
  }
  broadcast(existing.boardId, 'card_type.updated', cardType, req.userId!);
  res.json(cardType);
});

// DELETE /api/card-types/:id - remove a card type; its cards stay (cardTypeId -> NULL)
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeCardType(req, res, req.params.id, 'manage'))) return;
  const cardType = await prisma.cardType.findUnique({
    where: { id: req.params.id },
    select: { boardId: true, name: true },
  });
  if (!cardType) {
    res.status(404).json({ error: 'Card type not found' });
    return;
  }
  await prisma.cardType.delete({ where: { id: req.params.id } });
  await logActivity(cardType.boardId, req.userId!, 'card_type.deleted', {
    cardTypeName: cardType.name,
  });
  broadcast(cardType.boardId, 'card_type.deleted', { cardTypeId: req.params.id, boardId: cardType.boardId }, req.userId!);
  res.status(204).send();
});

export default router;
