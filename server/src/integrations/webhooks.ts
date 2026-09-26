import { createHmac, randomUUID } from 'node:crypto';
import prisma from '../db.js';
import { getProviderConfig, type IntegrationEvent } from './config.js';
import { statusForListTitle } from './status.js';

// Minimal outbound webhook mechanism (Kala had none). After a card mutation is
// committed, notifyCardIntegration() looks at the card's external references and, for
// each provider that is configured, enabled and subscribed to the event, POSTs a small
// HMAC-signed JSON payload. Cards without external references - i.e. normal Kala cards -
// never produce webhooks, and deliveries are fire-and-forget so a slow or dead endpoint
// can never delay or fail a Kala request.

export interface WebhookPayload {
  provider: string;
  event: IntegrationEvent;
  card_id: string;
  external_reference: {
    provider: string;
    external_id: string;
    external_url: string | null;
  };
  status: string;
  updated_at: string;
}

type CardChangeKind = 'created' | 'updated' | 'archived';

export interface CardChange {
  cardId: string;
  kind: CardChangeKind;
  /** The card's list before the change, so moves/completions can be detected. */
  previousListId?: string | null;
}

/** Signature header value for a webhook body: sha256=hex HMAC over `${timestamp}.${body}`. */
export function signWebhookBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Constant-time-ish verification helper for webhook consumers (documented for DocArchitect). */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  header: string
): boolean {
  return header === signWebhookBody(secret, timestamp, body);
}

async function deliver(
  provider: string,
  webhookUrl: string,
  webhookSecret: string | null,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Kala-Integration-Webhook',
    'X-Kala-Event': payload.event,
    'X-Kala-Delivery': randomUUID(),
    'X-Kala-Timestamp': timestamp,
    'X-Kala-Provider': provider,
  };
  if (webhookSecret) headers['X-Kala-Signature'] = signWebhookBody(webhookSecret, timestamp, body);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // Log the outcome only - never the payload, secret or any card content.
      console.error('Integration webhook delivery failed', { provider, event: payload.event, status: res.status });
    }
  } catch (err) {
    console.error('Integration webhook delivery failed', {
      provider,
      event: payload.event,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Emits integration webhooks for a committed card change. Call this after the database
 * write (and optionally after broadcast); it is a no-op for cards without external
 * references and for providers without webhooks. Never throws.
 */
export async function notifyCardIntegration(change: CardChange): Promise<void> {
  try {
    const card = await prisma.card.findUnique({
      where: { id: change.cardId },
      select: {
        id: true,
        listId: true,
        updatedAt: true,
        list: { select: { title: true } },
        externalReferences: { select: { provider: true, externalId: true, externalUrl: true } },
      },
    });
    if (!card || card.externalReferences.length === 0) return;

    const mappedStatus = statusForListTitle(card.list.title);
    let event: IntegrationEvent;
    if (change.kind === 'created') {
      event = 'card.created';
    } else if (change.kind === 'archived') {
      event = 'card.archived';
    } else if (change.previousListId && change.previousListId !== card.listId) {
      // A move into a "done"-like list is reported as completion - Kala reports that
      // the assigned work is done, never that the external issue is resolved.
      event = mappedStatus === 'completed' ? 'card.completed' : 'card.moved';
    } else {
      event = 'card.updated';
    }

    // A freshly created card reports "created"; afterwards status comes from its list.
    const status = change.kind === 'created' ? 'created' : mappedStatus;
    const updatedAt = card.updatedAt.toISOString();

    await Promise.all(
      card.externalReferences.map(async (ref) => {
        const config = getProviderConfig(ref.provider);
        if (!config || !config.enabled || !config.webhookUrl) return;
        if (!config.webhookEvents.includes(event)) return;
        await deliver(config.provider, config.webhookUrl, config.webhookSecret, {
          provider: config.provider,
          event,
          card_id: card.id,
          external_reference: {
            provider: ref.provider,
            external_id: ref.externalId,
            external_url: ref.externalUrl,
          },
          status,
          updated_at: updatedAt,
        });
      })
    );
  } catch (err) {
    console.error('Integration webhook notification failed', {
      cardId: change.cardId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
