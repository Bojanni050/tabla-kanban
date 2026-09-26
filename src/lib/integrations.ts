import type { Card, ExternalReference } from '@/types';

// Presentation helpers for externally-created cards (integration API).
// The server stores only the provider id (e.g. "docarchitect"); this is just the
// display side - no integration behaviour depends on it.

/** Human-friendly name for a provider id. */
export function providerLabel(provider: string): string {
  const known: Record<string, string> = { docarchitect: 'DocArchitect' };
  return (
    known[provider] ??
    provider.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** The primary external reference of a card, if it has one. */
export function primaryExternalReference(card: Pick<Card, 'externalReferences'>): ExternalReference | null {
  return card.externalReferences?.[0] ?? null;
}
