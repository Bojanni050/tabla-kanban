import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, authorizeSwimlane } from '../middleware/access.js';
import { broadcast } from '../realtime.js';
import type { Prisma } from '@prisma/client';

// Swimlanes: horizontal rows that group cards across the lists of one board.
// They follow the exact same shape and position strategy as lists.

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

// POST /api/swimlanes - create a swimlane at the bottom of the board
router.post('/', async (req: Request, res: Response) => {
  const { name, boardId } = req.body;
  if (!name || typeof name !== 'string' || typeof boardId !== 'string') {
    res.status(400).json({ error: 'name and boardId are required' });
    return;
  }
  if (!(await authorizeBoard(req, res, boardId, 'manage'))) return;
  const last = await prisma.swimlane.findFirst({
    where: { boardId },
    orderBy: { position: 'desc' },
  });
  const position = last ? last.position + 1 : 0;
  const swimlane = await prisma.swimlane.create({
    data: { name, boardId, position },
  });
  await logActivity(boardId, req.userId!, 'swimlane.created', {
    swimlaneId: swimlane.id,
    swimlaneName: swimlane.name,
  });
  broadcast(boardId, 'swimlane.created', swimlane, req.userId!);
  res.status(201).json(swimlane);
});

// PATCH /api/swimlanes/:id - rename or reposition a swimlane
router.patch('/:id', async (req: Request, res: Response) => {
  const { name, position } = req.body;
  const existing = await prisma.swimlane.findUnique({
    where: { id: req.params.id },
    select: { boardId: true, name: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Swimlane not found' });
    return;
  }
  if (!(await authorizeBoard(req, res, existing.boardId, 'manage'))) return;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }
  const swimlane = await prisma.swimlane.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(position !== undefined && { position: Number(position) }),
    },
  });
  if (name !== undefined && name !== existing.name) {
    await logActivity(existing.boardId, req.userId!, 'swimlane.renamed', {
      swimlaneId: swimlane.id,
      swimlaneName: swimlane.name,
      previousName: existing.name,
    });
  }
  if (position !== undefined) {
    await logActivity(existing.boardId, req.userId!, 'swimlane.reordered', {
      swimlaneId: swimlane.id,
      swimlaneName: swimlane.name,
    });
  }
  broadcast(existing.boardId, 'swimlane.updated', swimlane, req.userId!);
  res.json(swimlane);
});

// DELETE /api/swimlanes/:id - remove a swimlane; its cards stay (swimlaneId -> NULL)
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await authorizeSwimlane(req, res, req.params.id, 'manage'))) return;
  const swimlane = await prisma.swimlane.findUnique({
    where: { id: req.params.id },
    select: { boardId: true, name: true },
  });
  if (!swimlane) {
    res.status(404).json({ error: 'Swimlane not found' });
    return;
  }
  await prisma.swimlane.delete({ where: { id: req.params.id } });
  await logActivity(swimlane.boardId, req.userId!, 'swimlane.deleted', {
    swimlaneName: swimlane.name,
  });
  broadcast(swimlane.boardId, 'swimlane.deleted', { swimlaneId: req.params.id, boardId: swimlane.boardId }, req.userId!);
  res.status(204).send();
});

export default router;
