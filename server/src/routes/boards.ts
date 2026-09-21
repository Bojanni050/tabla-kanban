import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, authorizeWorkspace, parseName, roleCan } from '../middleware/access.js';
import { broadcast } from '../realtime.js';
import type { List, Label, Swimlane, CardType } from '@prisma/client';

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
      swimlanes: {
        orderBy: { position: 'asc' },
      },
      cardTypes: {
        orderBy: { position: 'asc' },
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
              assignee: {
                select: { id: true, name: true, email: true },
              },
              swimlane: {
                select: { id: true, name: true },
              },
              cardType: {
                select: { id: true, name: true, color: true },
              },
              activities: {
                orderBy: { createdAt: 'desc' },
                take: 20,
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

// GET /api/boards/:id/activity - recent board-level activity (e.g. team changes)
router.get('/:id/activity', async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.id))) return;
  try {
    const activity = await prisma.boardActivity.findMany({
      where: { boardId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(activity);
  } catch (error) {
    console.error('Error fetching board activity:', error);
    res.status(500).json({ error: 'Failed to fetch board activity' });
  }
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

// POST /api/boards/:id/apply-template
//
// Applies a built-in board template (lists + labels + swimlanes + card types)
// in a single Prisma transaction so a failure can never leave a half-applied
// template behind. Duplicate-safe: existing labels, swimlanes and card types
// with the same (case-insensitive) name are reused as-is and never modified.
// Lists follow the classic template logic and are always appended in order.
// Regular members keep the classic lists+labels flow; swimlanes and card
// types are only created for owners/admins, mirroring their own routes.
// No cards are ever created or touched.
router.post('/:id/apply-template', async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'edit'))) return;
  const canManage = roleCan(req.boardRole!, 'manage');

  const asNames = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
      : [];

  const lists = asNames(req.body?.lists).slice(0, 50);
  const swimlanes = asNames(req.body?.swimlanes).slice(0, 50);
  const asNamedColors = (value: unknown, fallbackColor: string) =>
    (Array.isArray(value) ? value : [])
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .map((v) => ({
        name: typeof v.name === 'string' ? v.name.trim() : '',
        color: typeof v.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.color.trim()) ? v.color.trim() : fallbackColor,
      }))
      .filter((v) => v.name.length > 0 && v.name.length <= 100)
      .slice(0, 50);
  const labels = asNamedColors(req.body?.labels, '#CE6F51');
  const cardTypes = asNamedColors(req.body?.cardTypes, '#5B8DD9');

  if (lists.length + labels.length + swimlanes.length + cardTypes.length === 0) {
    res.status(400).json({ error: 'template must define at least one list, label, swimlane or card type' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const actorId = req.userId!;

      const createdLists: List[] = [];
      const lastList = await tx.list.findFirst({
        where: { boardId },
        orderBy: { position: 'desc' },
      });
      let listPosition = lastList ? lastList.position + 1 : 0;
      for (const title of lists) {
        const list = await tx.list.create({
          data: { title, boardId, position: listPosition++ },
        });
        createdLists.push(list);
      }

      const existingLabels = await tx.label.findMany({ where: { boardId } });
      const labelNames = new Set(existingLabels.map((l) => l.name.trim().toLowerCase()));
      const createdLabels: Label[] = [];
      for (const { name, color } of labels) {
        if (labelNames.has(name.trim().toLowerCase())) continue;
        const label = await tx.label.create({
          data: { name, color, boardId },
        });
        labelNames.add(name.trim().toLowerCase());
        createdLabels.push(label);
      }

      const existingSwimlanes = canManage
        ? await tx.swimlane.findMany({
            where: { boardId },
            orderBy: { position: 'asc' },
          })
        : [];
      const swimlaneNames = new Set(existingSwimlanes.map((s) => s.name.trim().toLowerCase()));
      const createdSwimlanes: Swimlane[] = [];
      let swimlanePosition = existingSwimlanes.at(-1)?.position ?? -1;
      for (const name of canManage ? swimlanes : []) {
        if (swimlaneNames.has(name.trim().toLowerCase())) continue;
        const swimlane = await tx.swimlane.create({
          data: { name, boardId, position: (swimlanePosition += 1) },
        });
        swimlaneNames.add(name.trim().toLowerCase());
        createdSwimlanes.push(swimlane);
      }

      const existingCardTypes = canManage
        ? await tx.cardType.findMany({
            where: { boardId },
            orderBy: { position: 'asc' },
          })
        : [];
      const cardTypeNames = new Set(existingCardTypes.map((c) => c.name.trim().toLowerCase()));
      const createdCardTypes: CardType[] = [];
      let cardTypePosition = existingCardTypes.at(-1)?.position ?? -1;
      for (const { name, color } of canManage ? cardTypes : []) {
        if (cardTypeNames.has(name.trim().toLowerCase())) continue;
        const cardType = await tx.cardType.create({
          data: { name, color, boardId, position: (cardTypePosition += 1) },
        });
        cardTypeNames.add(name.trim().toLowerCase());
        createdCardTypes.push(cardType);
      }

      const actorName = await tx.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      await tx.boardActivity.create({
        data: {
          boardId,
          actorId,
          type: 'template.applied',
          metadata: {
            lists: createdLists.length,
            labels: createdLabels.length,
            swimlanes: createdSwimlanes.length,
            cardTypes: createdCardTypes.length,
            actorName: actorName?.name ?? null,
          },
        },
      });

      return {
        createdLists,
        createdLabels,
        createdSwimlanes,
        createdCardTypes,
        counts: {
          lists: lists.length,
          labelsCreated: createdLabels.length,
          labelsExisting: labels.length - createdLabels.length,
          swimlanesCreated: createdSwimlanes.length,
          swimlanesExisting: swimlanes.length - createdSwimlanes.length,
          cardTypesCreated: createdCardTypes.length,
          cardTypesExisting: cardTypes.length - createdCardTypes.length,
        },
      };
    });

    // The transaction committed: notify collaborators about every created part.
    for (const list of result.createdLists) broadcast(boardId, 'list.created', list, req.userId!);
    for (const label of result.createdLabels) broadcast(boardId, 'label.created', label, req.userId!);
    for (const swimlane of result.createdSwimlanes) broadcast(boardId, 'swimlane.created', swimlane, req.userId!);
    for (const cardType of result.createdCardTypes) broadcast(boardId, 'card_type.created', cardType, req.userId!);

    res.status(201).json(result.counts);
  } catch (error) {
    console.error('Error applying board template:', error);
    res.status(500).json({ error: 'Failed to apply the template' });
  }
});

export default router;
