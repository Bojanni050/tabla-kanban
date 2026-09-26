import type { ExternalReference, Priority } from '@prisma/client';
import { statusForListTitle, type IntegrationStatus } from './status.js';

// The task representation the integration API returns to external systems. It is a
// deliberate, stable projection of a Kala card - snake_case per the integration
// contract - and never leaks internal Kala payloads.

export const integrationCardInclude = {
  labels: { select: { id: true, name: true, color: true } },
  assignee: { select: { id: true, name: true, email: true } },
  list: {
    select: {
      id: true,
      title: true,
      boardId: true,
      board: { select: { id: true, name: true } },
    },
  },
  externalReferences: true,
} as const;

export type IntegrationCard = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  priority: Priority | null;
  dueDate: Date | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  list: { id: string; title: string; boardId: string; board: { id: string; name: string } };
  assignee: { id: string; name: string | null; email: string } | null;
  labels: { id: string; name: string; color: string }[];
  externalReferences: ExternalReference[];
};

export interface ExternalReferencePayload {
  provider: string;
  external_id: string;
  external_url: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export interface TaskPayload {
  id: string;
  title: string;
  description: string | null;
  status: IntegrationStatus;
  board: { id: string; name: string };
  list: { id: string; title: string };
  members: { id: string; name: string | null; email: string }[];
  labels: { id: string; name: string; color: string }[];
  priority: Priority | null;
  due_date: string | null;
  archived: boolean;
  external_reference: ExternalReferencePayload;
  created_at: string;
  updated_at: string;
}

export function externalReferencePayload(ref: ExternalReference): ExternalReferencePayload {
  return {
    provider: ref.provider,
    external_id: ref.externalId,
    external_url: ref.externalUrl,
    metadata: ref.metadata ?? null,
    created_at: ref.createdAt.toISOString(),
    updated_at: ref.updatedAt.toISOString(),
  };
}

/**
 * Builds the task payload for `provider`'s reference on the card. A card can carry
 * references from several providers; each sees its own. Throws when the card has no
 * reference for this provider (the caller must treat that as not-found).
 */
export function buildTaskPayload(
  card: IntegrationCard,
  provider: string,
  statusOverride?: IntegrationStatus
): TaskPayload {
  const ref = card.externalReferences.find((r) => r.provider === provider);
  if (!ref) throw new Error(`Card ${card.id} has no external reference for '${provider}'`);
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    status: statusOverride ?? statusForListTitle(card.list.title),
    board: { id: card.list.board.id, name: card.list.board.name },
    list: { id: card.list.id, title: card.list.title },
    members: card.assignee ? [{ id: card.assignee.id, name: card.assignee.name, email: card.assignee.email }] : [],
    labels: card.labels,
    priority: card.priority,
    due_date: card.dueDate ? card.dueDate.toISOString() : null,
    archived: card.archived,
    external_reference: externalReferencePayload(ref),
    created_at: card.createdAt.toISOString(),
    updated_at: card.updatedAt.toISOString(),
  };
}
