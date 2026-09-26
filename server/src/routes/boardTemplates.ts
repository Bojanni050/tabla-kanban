import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { authorizeBoard, roleCan } from '../middleware/access.js';
import { broadcast } from '../realtime.js';

// POST /api/boards/:id/apply-template - create a template's workflow structure
// (lists, labels, swimlanes, card types) on a board in one atomic operation.
//
// This reuses the existing models, position strategies and realtime events of
// the individual create routes - it only wraps them in a single Prisma
// transaction so a failure never leaves a half-applied template behind.
// Broadcasts go out after the commit, and no activity rows are written (bulk
// setup should not spam the activity history). No cards are ever created or
// touched here.
//
// Permissions follow the existing rules per section: lists and labels need
// 'edit', swimlanes and card types need 'manage'. A member without 'manage'
// still gets the lists and labels; the restricted sections are reported back
// as skipped instead of failing the whole apply. Existing objects are never
// modified: a label, swimlane or card type whose (trimmed, case-insensitive)
// name already exists on the board is reused as-is.

const router = Router();

const MAX_ITEMS = 50;

function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 100)
    .slice(0, MAX_ITEMS);
}

function cleanColored(value: unknown): { name: string; color: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is { name: unknown; color: unknown } =>
        typeof v === 'object' && v !== null && 'name' in v && 'color' in v
    )
    .map((v) => ({ name: String(v.name).trim(), color: String(v.color).trim() }))
    .filter((v) => v.name.length > 0 && v.name.length <= 100 && v.color.length > 0 && v.color.length <= 32)
    .slice(0, MAX_ITEMS);
}

const keyOf = (name: string) => name.trim().toLowerCase();

router.post('/:id/apply-template', async (req: Request, res: Response) => {
  const boardId = req.params.id;
  if (!(await authorizeBoard(req, res, boardId, 'edit'))) return;

  const body = req.body ?? {};
  const lists = cleanNames(body.lists);
  const labels = cleanColored(body.labels);
  const swimlanes = cleanNames(body.swimlanes);
  const cardTypes = cleanColored(body.cardTypes);

  if (lists.length === 0 && labels.length === 0 && swimlanes.length === 0 && cardTypes.length === 0) {
    res.status(400).json({ error: 'Template is empty: provide at least one list, label, swimlane or card type' });
    return;
  }

  const canManage = roleCan(req.boardRole!, 'manage');
  const restrictedSwimlanes = canManage ? 0 : swimlanes.length;
  const restrictedCardTypes = canManage ? 0 : cardTypes.length;
  const wantedSwimlanes = canManage ? swimlanes : [];
  const wantedCardTypes = canManage ? cardTypes : [];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [lastList, existingLabels, lastSwimlane, existingSwimlanes, lastCardType, existingCardTypes] =
        await Promise.all([
          tx.list.findFirst({ where: { boardId }, orderBy: { position: 'desc' } }),
          tx.label.findMany({ where: { boardId }, select: { name: true } }),
          tx.swimlane.findFirst({ where: { boardId }, orderBy: { position: 'desc' } }),
          tx.swimlane.findMany({ where: { boardId }, select: { name: true } }),
          tx.cardType.findFirst({ where: { boardId }, orderBy: { position: 'desc' } }),
          tx.cardType.findMany({ where: { boardId }, select: { name: true } }),
        ]);

      const labelKeys = new Set(existingLabels.map((l) => keyOf(l.name)));
      const swimlaneKeys = new Set(existingSwimlanes.map((s) => keyOf(s.name)));
      const cardTypeKeys = new Set(existingCardTypes.map((c) => keyOf(c.name)));

      const listStart = lastList ? lastList.position + 1 : 0;
      const createdLists = [];
      for (let i = 0; i < lists.length; i++) {
        createdLists.push(
          await tx.list.create({
            data: { title: lists[i], boardId, position: listStart + i },
            include: { cards: { orderBy: { position: 'asc' } } },
          })
        );
      }

      const createdLabels = [];
      let labelsExisting = 0;
      for (const label of labels) {
        if (labelKeys.has(keyOf(label.name))) {
          labelsExisting++;
          continue;
        }
        labelKeys.add(keyOf(label.name));
        createdLabels.push(await tx.label.create({ data: { ...label, boardId } }));
      }

      const swimlaneStart = lastSwimlane ? lastSwimlane.position + 1 : 0;
      const createdSwimlanes = [];
      let swimlanesExisting = 0;
      for (let i = 0; i < wantedSwimlanes.length; i++) {
        if (swimlaneKeys.has(keyOf(wantedSwimlanes[i]))) {
          swimlanesExisting++;
          continue;
        }
        swimlaneKeys.add(keyOf(wantedSwimlanes[i]));
        createdSwimlanes.push(
          await tx.swimlane.create({
            data: { name: wantedSwimlanes[i], boardId, position: swimlaneStart + createdSwimlanes.length },
          })
        );
      }

      const cardTypeStart = lastCardType ? lastCardType.position + 1 : 0;
      const createdCardTypes = [];
      let cardTypesExisting = 0;
      for (const cardType of wantedCardTypes) {
        if (cardTypeKeys.has(keyOf(cardType.name))) {
          cardTypesExisting++;
          continue;
        }
        cardTypeKeys.add(keyOf(cardType.name));
        createdCardTypes.push(
          await tx.cardType.create({
            data: { ...cardType, boardId, position: cardTypeStart + createdCardTypes.length },
          })
        );
      }

      return {
        lists: createdLists,
        labels: { created: createdLabels, existing: labelsExisting, restricted: 0 },
        swimlanes: { created: createdSwimlanes, existing: swimlanesExisting, restricted: restrictedSwimlanes },
        cardTypes: { created: createdCardTypes, existing: cardTypesExisting, restricted: restrictedCardTypes },
      };
    });

    const actorId = req.userId!;
    for (const list of result.lists) broadcast(boardId, 'list.created', list, actorId);
    for (const label of result.labels.created) broadcast(boardId, 'label.created', label, actorId);
    for (const swimlane of result.swimlanes.created) broadcast(boardId, 'swimlane.created', swimlane, actorId);
    for (const cardType of result.cardTypes.created) broadcast(boardId, 'card_type.created', cardType, actorId);

    res.status(201).json(result);
  } catch (error) {
    console.error('Error applying board template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

export default router;
