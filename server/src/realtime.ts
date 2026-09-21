import { randomUUID } from 'crypto';
import type { Response } from 'express';
import prisma from './db.js';

// Real-time fan-out for board collaboration.
//
// PostgreSQL remains the source of truth: routes persist a change first and
// only then call broadcast(). Messages are notifications about committed
// changes, never a substitute for the database.
//
// Transport is Server-Sent Events (one GET /api/realtime?boardId=... stream
// per open board). Each board id is a "room": a subscriber only receives
// events for the board it subscribed to, and subscribing requires board
// membership (checked in the realtime route with authorizeBoard).

export type RealtimeEventType =
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'card.created'
  | 'card.updated'
  | 'card.archived'
  | 'card.restored'
  | 'card.deleted'
  | 'label.created'
  | 'label.updated'
  | 'label.deleted'
  | 'swimlane.created'
  | 'swimlane.updated'
  | 'swimlane.deleted'
  | 'card_type.created'
  | 'card_type.updated'
  | 'card_type.deleted'
  | 'member.added'
  | 'member.updated'
  | 'member.removed';

export interface RealtimeMessage {
  id: string;
  type: RealtimeEventType;
  boardId: string;
  actorId: string;
  at: string;
  data: unknown;
}

interface Subscriber {
  res: Response;
  userId: string;
}

const rooms = new Map<string, Set<Subscriber>>();

export function subscribe(boardId: string, sub: Subscriber): void {
  let set = rooms.get(boardId);
  if (!set) {
    set = new Set();
    rooms.set(boardId, set);
  }
  set.add(sub);
}

export function unsubscribe(boardId: string, sub: Subscriber): void {
  const set = rooms.get(boardId);
  if (!set) return;
  set.delete(sub);
  if (set.size === 0) rooms.delete(boardId);
}

/** Close every stream a user holds for a board (e.g. right after removal). */
export function disconnectUserFromBoard(boardId: string, userId: string): void {
  const set = rooms.get(boardId);
  if (!set) return;
  for (const sub of [...set]) {
    if (sub.userId === userId) {
      set.delete(sub);
      try {
        sub.res.write(`event: revoked\ndata: ${JSON.stringify({ boardId })}\n\n`);
        sub.res.end();
      } catch {
        // Already gone - nothing to do.
      }
    }
  }
  if (set.size === 0) rooms.delete(boardId);
}

/** Notify subscribers of a change that has already been persisted. Never throws. */
export function broadcast(
  boardId: string,
  type: RealtimeEventType,
  data: unknown,
  actorId: string
): void {
  const set = rooms.get(boardId);
  if (!set || set.size === 0) return;
  const message: RealtimeMessage = {
    id: randomUUID(),
    type,
    boardId,
    actorId,
    at: new Date().toISOString(),
    data,
  };
  const payload = `id: ${message.id}\nevent: board\ndata: ${JSON.stringify(message)}\n\n`;
  for (const sub of [...set]) {
    try {
      sub.res.write(payload);
    } catch {
      set.delete(sub);
    }
  }
}

const fullCardInclude = {
  labels: true,
  checklistItems: { orderBy: { position: 'asc' } as const },
  list: { select: { id: true, title: true, boardId: true } },
};

/** Re-read a card with everything the board UI needs (labels, checklist, list). */
export function getFullCard(cardId: string) {
  return prisma.card.findUnique({
    where: { id: cardId },
    include: fullCardInclude,
  });
}

export async function boardIdForList(listId: string): Promise<string | null> {
  const row = await prisma.list.findUnique({
    where: { id: listId },
    select: { boardId: true },
  });
  return row?.boardId ?? null;
}

export async function boardIdForCard(cardId: string): Promise<string | null> {
  const row = await prisma.card.findUnique({
    where: { id: cardId },
    select: { list: { select: { boardId: true } } },
  });
  return row?.list.boardId ?? null;
}

export async function boardIdForLabel(labelId: string): Promise<string | null> {
  const row = await prisma.label.findUnique({
    where: { id: labelId },
    select: { boardId: true },
  });
  return row?.boardId ?? null;
}

export async function boardIdForChecklistItem(itemId: string): Promise<string | null> {
  const row = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { card: { select: { list: { select: { boardId: true } } } } },
  });
  return row?.card.list.boardId ?? null;
}
