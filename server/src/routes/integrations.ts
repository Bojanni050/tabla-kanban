import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { authorizeBoard, authorizeCard, authorizeList } from '../middleware/access.js';
import { broadcast } from '../realtime.js';
import { cardInclude } from './cards.js';
import { integrationHandler, mintToken, requireIntegrationKey } from '../integrations/auth.js';
import { getProviderConfig, listProviderConfigs } from '../integrations/config.js';
import { notFound, validationError } from '../integrations/errors.js';
import { buildTaskPayload } from '../integrations/payload.js';
import { listForStatus, statusForListTitle, type ListStatus } from '../integrations/status.js';
import { notifyCardIntegration } from '../integrations/webhooks.js';

// The external integration API (DocArchitect first, any provider later).
//
// Two kinds of traffic share this router:
//   - Session-authenticated key management (GET/POST/DELETE /keys, GET /providers),
//     mounted behind requireAuth per route like the rest of Kala's user API.
//   - Machine traffic (/:provider/tasks..., /:provider/boards...) authenticated with an
//     integration API key. Requests act as the user who issued the key, so every
//     existing BoardMember permission rule applies unchanged.
//
// Errors are `{ error, code, details? }` (see integrations/errors.ts); unexpected
// failures fall through to integrationHandler -> generic 500, never a stack trace.

const router = Router();

// Same projection as Kala's own card responses, plus the external references and the
// board name the integration payload needs - so one query serves both the UI broadcast
// and the task payload.
const taskInclude = {
  ...cardInclude,
  externalReferences: true,
  list: {
    select: {
      id: true,
      title: true,
      boardId: true,
      board: { select: { id: true, name: true } },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw validationError(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      }))
    );
  }
  return parsed.data as z.output<S>;
}

const providerSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, 'provider must be a lower-case slug (e.g. docarchitect)');

const titleSchema = z.string().trim().min(1, 'title must not be empty').max(500, 'title must be at most 500 characters');

const prioritySchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.enum(['LOW', 'MEDIUM', 'HIGH'], { errorMap: () => ({ message: 'priority must be LOW, MEDIUM or HIGH' }) }));

const dueDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'due_date must be a valid ISO 8601 date');

const createTaskSchema = z.object({
  title: titleSchema,
  // Required by the integration contract; an empty string is allowed (DocArchitect
  // actions may have no prose yet), but the field must be present.
  description: z.string({ required_error: 'description is required' }),
  source: z.string().trim().min(1, 'source is required'),
  external_id: z.string().trim().min(1, 'external_id is required').max(255, 'external_id must be at most 255 characters'),
  external_url: z.string().trim().min(1, 'external_url is required').url('external_url must be a valid URL'),
  board_id: z.string().trim().min(1).optional(),
  list_id: z.string().trim().min(1).optional(),
  label_ids: z.array(z.string().trim().min(1)).optional(),
  member_ids: z.array(z.string().trim().min(1)).optional(),
  priority: prioritySchema.optional(),
  due_date: dueDateSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateTaskSchema = z.object({
  title: titleSchema.optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'status must be one of todo, in_progress, completed, cancelled' }),
  }).optional(),
  list_id: z.string().trim().min(1).optional(),
  priority: z.union([prioritySchema, z.null()]).optional(),
  due_date: z.union([dueDateSchema, z.null()]).optional(),
});

// ---------------------------------------------------------------------------
// Session-authenticated: provider configuration discovery (never exposes secrets)
// ---------------------------------------------------------------------------

router.get('/providers', requireAuth, integrationHandler(async (_req: Request, res: Response) => {
  res.json(
    listProviderConfigs().map((config) => ({
      provider: config.provider,
      label: config.label,
      enabled: config.enabled,
      base_url: config.baseUrl,
      webhook: { configured: config.webhookUrl !== null, events: config.webhookEvents },
      default_board_id: config.defaultBoardId,
      default_list_id: config.defaultListId,
    }))
  );
}));

// ---------------------------------------------------------------------------
// Session-authenticated: integration API keys (created and revoked by a Kala user)
// ---------------------------------------------------------------------------

const createKeySchema = z.object({
  provider: providerSlugSchema,
  name: z.string().trim().min(1).max(60).optional(),
});

// POST /api/integrations/keys - mint a key. The plaintext token is returned exactly once.
router.post('/keys', requireAuth, integrationHandler(async (req: Request, res: Response) => {
  const { provider, name } = parseBody(createKeySchema, req.body);
  const { token, tokenHash, tokenPrefix } = mintToken();
  const key = await prisma.integrationKey.create({
    data: {
      provider,
      name: name ?? `${provider} integration`,
      userId: req.userId!,
      tokenHash,
      tokenPrefix,
    },
  });
  res.status(201).json({
    id: key.id,
    name: key.name,
    provider: key.provider,
    token, // shown once; only its hash is stored
    token_prefix: key.tokenPrefix,
    created_at: key.createdAt.toISOString(),
  });
}));

// GET /api/integrations/keys - the caller's keys; never includes a token.
router.get('/keys', requireAuth, integrationHandler(async (req: Request, res: Response) => {
  const keys = await prisma.integrationKey.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    keys.map((key) => ({
      id: key.id,
      name: key.name,
      provider: key.provider,
      token_prefix: key.tokenPrefix,
      revoked: key.revokedAt !== null,
      last_used_at: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
      created_at: key.createdAt.toISOString(),
    }))
  );
}));

// DELETE /api/integrations/keys/:id - revoke a key. Revocation is immediate.
router.delete('/keys/:id', requireAuth, integrationHandler(async (req: Request, res: Response) => {
  const result = await prisma.integrationKey.updateMany({
    where: { id: req.params.id, userId: req.userId!, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    // Already revoked, never existed, or someone else's key - never distinguish.
    const owned = await prisma.integrationKey.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      select: { id: true },
    });
    if (!owned) throw notFound('Key not found');
    res.status(204).send();
    return;
  }
  res.status(204).send();
}));

// ---------------------------------------------------------------------------
// Machine-authenticated: tasks
// ---------------------------------------------------------------------------

interface Placement {
  listId: string;
  boardId: string;
}

/**
 * Resolves where a created card goes. Never invents boards or lists: unknown ids are
 * validation errors, and with no placement given the provider's configured defaults
 * apply (or a clear 422 when nothing is configured).
 */
async function resolvePlacement(
  provider: string,
  body: { board_id?: string; list_id?: string }
): Promise<Placement> {
  const config = getProviderConfig(provider);
  const requestedBoardId = body.board_id ?? (body.list_id ? undefined : config?.defaultBoardId ?? undefined);
  const requestedListId = body.list_id ?? (body.board_id ? undefined : config?.defaultListId ?? undefined);

  if (requestedListId) {
    const list = await prisma.list.findUnique({ where: { id: requestedListId }, select: { id: true, boardId: true } });
    if (!list) throw validationError([{ field: 'list_id', message: 'list_id does not exist' }]);
    if (requestedBoardId && list.boardId !== requestedBoardId) {
      throw validationError([{ field: 'list_id', message: 'list_id does not belong to board_id' }]);
    }
    return { listId: list.id, boardId: list.boardId };
  }

  if (requestedBoardId) {
    const board = await prisma.board.findUnique({ where: { id: requestedBoardId }, select: { id: true } });
    if (!board) throw validationError([{ field: 'board_id', message: 'board_id does not exist' }]);
    // A board without lists cannot host a card; never create one implicitly.
    const firstList = await prisma.list.findFirst({
      where: { boardId: board.id },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    if (!firstList) {
      throw validationError([{ field: 'board_id', message: 'The requested board has no lists to place the card in' }]);
    }
    return { listId: firstList.id, boardId: board.id };
  }

  throw validationError([
    { field: 'list_id', message: 'list_id or board_id is required (no default placement is configured)' },
  ]);
}

// POST /api/integrations/:provider/tasks - create a card from an external system.
// Idempotent on provider + external_id: a retry returns the existing card (200 +
// X-Idempotent-Replay) instead of creating a duplicate.
router.post('/:provider/tasks', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  const provider = req.integration!.provider;
  const body = parseBody(createTaskSchema, req.body);

  if (body.source.toLowerCase() !== provider) {
    throw validationError([
      { field: 'source', message: `source must match the provider in the URL ('${provider}')` },
    ]);
  }

  // Idempotency first: a retried request must succeed even if placement in the body
  // has since become stale. Access is still enforced on the existing card.
  const existing = await prisma.externalReference.findUnique({
    where: { provider_externalId: { provider, externalId: body.external_id } },
    select: { card: { select: { id: true } } },
  });
  if (existing) {
    if (!(await authorizeCard(req, res, existing.card.id, 'view'))) return;
    const card = await prisma.card.findUnique({ where: { id: existing.card.id }, include: taskInclude });
    if (!card) throw notFound('Task not found');
    res.setHeader('X-Idempotent-Replay', 'true');
    res.status(200).json(buildTaskPayload(card, provider));
    return;
  }

  const { listId, boardId } = await resolvePlacement(provider, body);
  // Same permission gate as Kala's own POST /api/cards: you must be able to edit the list.
  if (!(await authorizeList(req, res, listId, 'edit'))) return;

  // Labels must exist and belong to the target board; never attach silently.
  let labelIds: string[] = [];
  if (body.label_ids?.length) {
    labelIds = [...new Set(body.label_ids)];
    const labels = await prisma.label.findMany({ where: { id: { in: labelIds } } });
    if (labels.length !== labelIds.length) {
      throw validationError([{ field: 'label_ids', message: 'label_ids contains a label that does not exist' }]);
    }
    const foreign = labels.find((label) => label.boardId !== boardId);
    if (foreign) {
      throw validationError([
        { field: 'label_ids', message: `label '${foreign.id}' does not belong to the target board` },
      ]);
    }
  }

  // Kala cards have a single assignee, so at most one member is accepted - explicitly,
  // never by dropping the rest silently.
  let assigneeId: string | null = null;
  if (body.member_ids?.length) {
    if (body.member_ids.length > 1) {
      throw validationError([
        { field: 'member_ids', message: 'Kala cards have a single assignee; member_ids must contain at most one id' },
      ]);
    }
    const membership = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: body.member_ids[0] } },
      select: { userId: true },
    });
    if (!membership) {
      throw validationError([
        { field: 'member_ids', message: 'member_ids contains a user who is not a member of the target board' },
      ]);
    }
    assigneeId = membership.userId;
  }

  const lastCard = await prisma.card.findFirst({ where: { listId }, orderBy: { position: 'desc' } });
  const position = lastCard ? lastCard.position + 1 : 0;

  let card;
  try {
    card = await prisma.$transaction(async (tx) => {
      const created = await tx.card.create({
        data: {
          title: body.title,
          description: body.description,
          listId,
          position,
          priority: body.priority ?? null,
          dueDate: body.due_date ? new Date(body.due_date) : null,
          assigneeId,
          ...(labelIds.length && { labels: { connect: labelIds.map((id) => ({ id })) } }),
        },
        select: { id: true },
      });
      await tx.externalReference.create({
        data: {
          cardId: created.id,
          provider,
          externalId: body.external_id,
          externalUrl: body.external_url,
          ...(body.metadata && { metadata: body.metadata as Prisma.InputJsonValue }),
        },
      });
      // Re-read so the returned card carries the freshly created external reference.
      return tx.card.findUniqueOrThrow({ where: { id: created.id }, include: taskInclude });
    });
  } catch (error) {
    // A concurrent retry won the unique (provider, externalId) race: return its card.
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      const winner = await prisma.externalReference.findUnique({
        where: { provider_externalId: { provider, externalId: body.external_id } },
        select: { card: { select: { id: true } } },
      });
      if (winner) {
        if (!(await authorizeCard(req, res, winner.card.id, 'view'))) return;
        const replayCard = await prisma.card.findUnique({ where: { id: winner.card.id }, include: taskInclude });
        if (!replayCard) throw notFound('Task not found');
        res.setHeader('X-Idempotent-Replay', 'true');
        res.status(200).json(buildTaskPayload(replayCard, provider));
        return;
      }
    }
    throw error;
  }

  broadcast(card.list.boardId, 'card.created', card, req.userId!);
  void notifyCardIntegration({ cardId: card.id, kind: 'created' });
  // A freshly created task reports status "created"; later reads normalize its list.
  res.status(201).json(buildTaskPayload(card, provider, 'created'));
}));

async function findTaskCard(provider: string, externalId: string) {
  const ref = await prisma.externalReference.findUnique({
    where: { provider_externalId: { provider, externalId } },
    select: { card: { select: { id: true } } },
  });
  if (!ref) throw notFound('No task exists for this external id');
  return ref.card.id;
}

// GET /api/integrations/:provider/tasks/:externalId - current state for synchronization.
router.get('/:provider/tasks/:externalId', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  const provider = req.integration!.provider;
  const cardId = await findTaskCard(provider, req.params.externalId);
  if (!(await authorizeCard(req, res, cardId, 'view'))) return;
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: taskInclude });
  if (!card) throw notFound('No task exists for this external id');
  res.json(buildTaskPayload(card, provider));
}));

// PATCH /api/integrations/:provider/tasks/:externalId - update title, description,
// status/list, priority and due date under Kala's normal permission rules.
router.patch('/:provider/tasks/:externalId', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  const provider = req.integration!.provider;
  const body = parseBody(updateTaskSchema, req.body);
  const cardId = await findTaskCard(provider, req.params.externalId);
  if (!(await authorizeCard(req, res, cardId, 'edit'))) return;

  const current = await prisma.card.findUnique({
    where: { id: cardId },
    select: { listId: true, list: { select: { boardId: true } } },
  });
  if (!current) throw notFound('No task exists for this external id');

  if (body.status !== undefined && body.list_id !== undefined) {
    throw validationError([
      { field: 'status', message: 'Provide either status or list_id, not both' },
    ]);
  }

  // Resolve the target list from either an explicit id or a normalized status.
  let targetListId: string | undefined;
  if (body.list_id !== undefined) {
    const list = await prisma.list.findUnique({ where: { id: body.list_id }, select: { id: true, boardId: true } });
    if (!list) throw validationError([{ field: 'list_id', message: 'list_id does not exist' }]);
    if (list.boardId !== current.list.boardId) {
      throw validationError([{ field: 'list_id', message: 'A card cannot move to a list on another board' }]);
    }
    targetListId = list.id;
  } else if (body.status !== undefined) {
    const lists = await prisma.list.findMany({
      where: { boardId: current.list.boardId },
      orderBy: { position: 'asc' },
    });
    const target = listForStatus(lists, body.status as ListStatus);
    if (!target) {
      throw validationError([
        { field: 'status', message: `No list on this board maps to status '${body.status}'` },
      ]);
    }
    targetListId = target.id;
  }

  if (targetListId && !(await authorizeList(req, res, targetListId, 'edit'))) return;

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (targetListId !== undefined) data.listId = targetListId;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.due_date !== undefined) data.dueDate = body.due_date === null ? null : new Date(body.due_date);

  const card = await prisma.card.update({
    where: { id: cardId },
    data,
    include: taskInclude,
  });

  broadcast(card.list.boardId, 'card.updated', card, req.userId!);
  void notifyCardIntegration({
    cardId: card.id,
    kind: 'updated',
    previousListId: targetListId !== undefined && targetListId !== current.listId ? current.listId : null,
  });
  res.json(buildTaskPayload(card, provider));
}));

// ---------------------------------------------------------------------------
// Machine-authenticated: discovery (so external systems never hardcode Kala ids)
// ---------------------------------------------------------------------------

// GET /api/integrations/:provider/boards - boards the key's user can see.
router.get('/:provider/boards', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  const boards = await prisma.board.findMany({
    where: { members: { some: { userId: req.userId } } },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(boards);
}));

// GET /api/integrations/:provider/boards/:boardId/lists - lists with normalized status.
router.get('/:provider/boards/:boardId/lists', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.boardId, 'view'))) return;
  const lists = await prisma.list.findMany({
    where: { boardId: req.params.boardId },
    orderBy: { position: 'asc' },
  });
  res.json(
    lists.map((list) => ({
      id: list.id,
      title: list.title,
      position: list.position,
      status: statusForListTitle(list.title),
    }))
  );
}));

// GET /api/integrations/:provider/boards/:boardId/labels
router.get('/:provider/boards/:boardId/labels', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.boardId, 'view'))) return;
  const labels = await prisma.label.findMany({
    where: { boardId: req.params.boardId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, color: true },
  });
  res.json(labels);
}));

// GET /api/integrations/:provider/boards/:boardId/members - members where permitted
// (same 'view' permission Kala's own member list uses).
router.get('/:provider/boards/:boardId/members', requireIntegrationKey(), integrationHandler(async (req: Request, res: Response) => {
  if (!(await authorizeBoard(req, res, req.params.boardId, 'view'))) return;
  const members = await prisma.boardMember.findMany({
    where: { boardId: req.params.boardId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(
    members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    }))
  );
}));

export default router;
