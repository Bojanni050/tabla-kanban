import type { BoardRole } from '@prisma/client';
import prisma from '../db.js';

// Builds the structured board context that is given to the model.
//
// READ-ONLY BY DESIGN: this module only ever calls prisma find*/count queries, all scoped to a
// single board. The model gets this JSON snapshot - it never gets database access, tools, or
// any way to change data. The caller (routes/ai.ts) has already verified that the user is a
// member of the board; nothing here reaches outside that board.
//
// Anything a model would otherwise have to compute (overdue status, counts, week boundaries)
// is calculated here so answers about deadlines do not depend on the model's date arithmetic.

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_CARDS = 150; // cards listed in full; totals always cover every card
const DESCRIPTION_CHARS = 300;
const FOCUS_DESCRIPTION_CHARS = 4000;
const CHECKLIST_ITEMS_PER_CARD = 8;
const FOCUS_CHECKLIST_ITEMS = 50;
const ACTIVITY_DAYS = 14;
const ACTIVITY_LIMIT = 30;

export class CardNotOnBoardError extends Error {
  constructor() {
    super('Card not found on this board');
  }
}

// Kala has no "completed" flag on cards; finished work lives in a list. Lists named like this
// are treated as finished so their cards are not reported as open, overdue or undated.
const FINISHED_LIST_RE = /^(done|completed?|finished|closed|shipped|released|archived?|afgerond|klaar|gedaan|voltooid)$/i;
const isFinishedList = (title: string) => FINISHED_LIST_RE.test(title.trim());

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The user's local date if the client sent a valid one, otherwise the server's UTC date. */
export function resolveToday(input?: string | null): string {
  if (input && DAY_RE.test(input) && !Number.isNaN(Date.parse(`${input}T00:00:00Z`))) return input;
  return new Date().toISOString().slice(0, 10);
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const clip = (text: string | null, max: number) =>
  text == null ? null : text.length > max ? `${text.slice(0, max)}… [truncated]` : text;
const priorityWord = (p: string | null) => (p ? p.toLowerCase() : null);

function describeDue(due: Date | null, todayMs: number) {
  if (!due) return { dueDate: null, dueStatus: 'no due date', daysUntilDue: null as number | null };
  const day = due.toISOString().slice(0, 10);
  const diff = Math.round((dayMs(day) - todayMs) / DAY_MS);
  const dueStatus =
    diff < 0 ? `overdue by ${-diff} day${-diff === 1 ? '' : 's'}` : diff === 0 ? 'due today' : `due in ${diff} day${diff === 1 ? '' : 's'}`;
  return { dueDate: day, dueStatus, daysUntilDue: diff };
}

const cardSelect = {
  id: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  labels: { select: { name: true } },
  checklistItems: {
    orderBy: { position: 'asc' as const },
    select: { title: true, completed: true, createdAt: true, updatedAt: true },
  },
};

type CardRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  labels: { name: string }[];
  checklistItems: { title: string; completed: boolean; createdAt: Date; updatedAt: Date }[];
};

function shapeCard(card: CardRow, listTitle: string, todayMs: number, opts: { descChars: number; maxItems: number }) {
  const finished = isFinishedList(listTitle);
  const due = describeDue(card.dueDate, todayMs);
  const done = card.checklistItems.filter((i) => i.completed).length;
  return {
    title: card.title,
    list: listTitle,
    inFinishedList: finished,
    description: clip(card.description, opts.descChars),
    priority: priorityWord(card.priority),
    dueDate: due.dueDate,
    dueStatus: due.dueStatus,
    labels: card.labels.map((l) => l.name),
    checklist: {
      done,
      total: card.checklistItems.length,
      items: card.checklistItems.slice(0, opts.maxItems).map((i) => ({ title: i.title, done: i.completed })),
      ...(card.checklistItems.length > opts.maxItems ? { moreItems: card.checklistItems.length - opts.maxItems } : {}),
    },
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

export interface BoardContextInput {
  boardId: string;
  userId: string;
  role: BoardRole;
  today?: string | null;
  focusCardId?: string | null;
}

export async function buildBoardContext({ boardId, userId, role, today, focusCardId }: BoardContextInput) {
  const todayDay = resolveToday(today);
  const todayMs = dayMs(todayDay);
  const sinceMs = todayMs - ACTIVITY_DAYS * DAY_MS;
  const since = new Date(Date.now() - ACTIVITY_DAYS * DAY_MS);

  const [board, user, archivedCount, recentlyArchived] = await Promise.all([
    prisma.board.findUnique({
      where: { id: boardId },
      select: {
        name: true,
        workspace: { select: { name: true } },
        labels: { select: { name: true }, orderBy: { createdAt: 'asc' } },
        lists: {
          orderBy: { position: 'asc' },
          select: {
            title: true,
            createdAt: true,
            cards: { where: { archived: false }, orderBy: { position: 'asc' }, select: cardSelect },
          },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.card.count({ where: { archived: true, list: { boardId } } }),
    prisma.card.findMany({
      where: { archived: true, updatedAt: { gte: since }, list: { boardId } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { title: true, updatedAt: true, list: { select: { title: true } } },
    }),
  ]);
  if (!board || !user) throw new CardNotOnBoardError();

  // ---- Cards ------------------------------------------------------------------------------
  const allCards = board.lists.flatMap((list) => list.cards.map((card) => ({ card, listTitle: list.title })));
  const openCardsOnly = allCards.filter(({ listTitle }) => !isFinishedList(listTitle));

  const dow = new Date(todayMs).getUTCDay(); // 0 = Sunday
  const weekStartMs = todayMs - ((dow + 6) % 7) * DAY_MS; // weeks start on Monday, like the board UI
  const weekEndMs = weekStartMs + 6 * DAY_MS;

  let overdue = 0, dueToday = 0, dueLaterThisWeek = 0, noDueDate = 0, noPriority = 0, highPriority = 0;
  for (const { card } of openCardsOnly) {
    const due = describeDue(card.dueDate, todayMs);
    if (due.daysUntilDue === null) noDueDate++;
    else if (due.daysUntilDue < 0) overdue++;
    else if (due.daysUntilDue === 0) dueToday++;
    else if (todayMs + due.daysUntilDue * DAY_MS <= weekEndMs) dueLaterThisWeek++;
    if (!card.priority) noPriority++;
    if (card.priority === 'HIGH') highPriority++;
  }

  // List the cards in full, in list order, up to the cap (per list, so equal list names stay apart).
  let remaining = MAX_CARDS;
  const listedByList = board.lists.map((list) => {
    const take = list.cards.slice(0, Math.max(remaining, 0));
    remaining -= take.length;
    return take.map((card) =>
      shapeCard(card, list.title, todayMs, { descChars: DESCRIPTION_CHARS, maxItems: CHECKLIST_ITEMS_PER_CARD })
    );
  });

  // ---- Recent activity (derived from timestamps only; no actor or diff is recorded) -------------
  type Activity = { at: string; event: string; card?: string; list?: string; item?: string };
  const activity: Activity[] = [];
  for (const list of board.lists) {
    if (list.createdAt.getTime() >= sinceMs) activity.push({ at: list.createdAt.toISOString(), event: 'list created', list: list.title });
    for (const card of list.cards) {
      if (card.createdAt.getTime() >= sinceMs) {
        activity.push({ at: card.createdAt.toISOString(), event: 'card created', card: card.title, list: list.title });
      } else if (card.updatedAt.getTime() >= sinceMs) {
        activity.push({ at: card.updatedAt.toISOString(), event: 'card edited or moved', card: card.title, list: list.title });
      }
      for (const item of card.checklistItems) {
        const created = item.createdAt.getTime();
        const updated = item.updatedAt.getTime();
        if (item.completed && updated >= sinceMs) {
          activity.push({ at: item.updatedAt.toISOString(), event: 'checklist item completed', card: card.title, list: list.title, item: item.title });
        } else if (created >= sinceMs) {
          activity.push({ at: item.createdAt.toISOString(), event: 'checklist item added', card: card.title, list: list.title, item: item.title });
        }
      }
    }
  }
  for (const card of recentlyArchived) {
    activity.push({ at: card.updatedAt.toISOString(), event: 'card archived', card: card.title, list: card.list.title });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  // ---- Focus card (card-specific requests) ------------------------------------------------
  let focusCard: ReturnType<typeof shapeCard> | null = null;
  if (focusCardId) {
    const row = await prisma.card.findUnique({
      where: { id: focusCardId },
      select: { ...cardSelect, archived: true, list: { select: { title: true, boardId: true } } },
    });
    // The card must belong to the board the user was authorised for.
    if (!row || row.list.boardId !== boardId) throw new CardNotOnBoardError();
    focusCard = {
      ...shapeCard(row, row.list.title, todayMs, { descChars: FOCUS_DESCRIPTION_CHARS, maxItems: FOCUS_CHECKLIST_ITEMS }),
      ...(row.archived ? { archived: true } : {}),
    } as ReturnType<typeof shapeCard>;
  }

  const context = {
    today: todayDay,
    weekday: new Date(todayMs).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    currentWeek: { start: isoDay(weekStartMs), end: isoDay(weekEndMs) },
    board: { name: board.name, workspace: board.workspace.name },
    currentUser: { name: user.name ?? user.email, email: user.email, roleOnBoard: role.toLowerCase() },
    totals: {
      openCards: openCardsOnly.length,
      cardsInFinishedLists: allCards.length - openCardsOnly.length,
      archivedCards: archivedCount,
      overdue,
      dueToday,
      dueLaterThisWeek,
      withoutDueDate: noDueDate,
      withoutPriority: noPriority,
      highPriority,
    },
    boardLabels: board.labels.map((l) => l.name),
    lists: board.lists.map((list, index) => ({
      name: list.title,
      likelyFinished: isFinishedList(list.title),
      cards: listedByList[index],
    })),
    ...(allCards.length > MAX_CARDS
      ? { note: `Only the first ${MAX_CARDS} of ${allCards.length} open cards are listed in full (in list order); totals cover all cards.` }
      : {}),
    recentActivity: {
      windowDays: ACTIVITY_DAYS,
      note: 'Derived from creation/update timestamps only. Who made a change, and what exactly changed, is not recorded.',
      events: activity.slice(0, ACTIVITY_LIMIT),
    },
    focusCard,
  };

  return { context, today: todayDay };
}
