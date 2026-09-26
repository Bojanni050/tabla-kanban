// Provider configuration for external integrations (DocArchitect first, others later).
//
// Everything is environment-driven and provider-agnostic: a provider "docarchitect" is
// configured through INTEGRATION_DOCARCHITECT_* variables, a future "github" through
// INTEGRATION_GITHUB_* - no provider-specific code anywhere in the app. Nothing here is
// required: without configuration Kala simply has no integrations and works as always.

export type IntegrationEvent =
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.completed'
  | 'card.archived';

export const INTEGRATION_EVENTS: readonly IntegrationEvent[] = [
  'card.created',
  'card.updated',
  'card.moved',
  'card.completed',
  'card.archived',
];

export interface IntegrationProviderConfig {
  /** Lower-case slug, e.g. "docarchitect". Used in URLs and on external references. */
  provider: string;
  /** Human label for the UI, e.g. "DocArchitect". Falls back to the slug. */
  label: string;
  /** Master switch. An unconfigured or disabled provider rejects machine requests. */
  enabled: boolean;
  /** Base URL of the external system (never hardcoded; informational for now). */
  baseUrl: string | null;
  /** Where Kala delivers webhook events for this provider. Null = no webhooks. */
  webhookUrl: string | null;
  /** Shared secret used to sign webhook payloads (HMAC-SHA256). Null = unsigned. */
  webhookSecret: string | null;
  /** Events this provider subscribed to. Defaults to every event. */
  webhookEvents: IntegrationEvent[];
  /** Optional placement defaults for created cards when the caller omits board/list. */
  defaultBoardId: string | null;
  defaultListId: string | null;
}

// A provider id is a lower-case slug: INTEGRATION_<PROVIDER>_<SETTING>.
const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ENV_PREFIX = 'INTEGRATION_';

const ENV_KEYS = ['ENABLED', 'LABEL', 'BASE_URL', 'WEBHOOK_URL', 'WEBHOOK_SECRET', 'WEBHOOK_EVENTS', 'DEFAULT_BOARD_ID', 'DEFAULT_LIST_ID'] as const;

function envFor(provider: string, suffix: (typeof ENV_KEYS)[number]): string | undefined {
  return process.env[`${ENV_PREFIX}${provider.toUpperCase().replace(/-/g, '_')}_${suffix}`];
}

function parseEvents(raw: string | undefined): IntegrationEvent[] {
  if (!raw) return [...INTEGRATION_EVENTS];
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is IntegrationEvent => (INTEGRATION_EVENTS as readonly string[]).includes(s));
  return wanted;
}

/** True when at least one INTEGRATION_<PROVIDER>_* variable is set. */
function isConfigured(provider: string): boolean {
  return ENV_KEYS.some((key) => envFor(provider, key) !== undefined);
}

/** Normalizes a provider id from a URL segment / user input, or null if malformed. */
export function normalizeProvider(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slug = value.trim().toLowerCase();
  return PROVIDER_RE.test(slug) ? slug : null;
}

/**
 * Configuration for one provider, or null when the provider has no
 * INTEGRATION_<PROVIDER>_* variables at all (unknown to this Kala instance).
 */
export function getProviderConfig(provider: string): IntegrationProviderConfig | null {
  const slug = normalizeProvider(provider);
  if (!slug || !isConfigured(slug)) return null;
  return {
    provider: slug,
    label: envFor(slug, 'LABEL')?.trim() || slug.charAt(0).toUpperCase() + slug.slice(1),
    enabled: (envFor(slug, 'ENABLED') ?? '').trim().toLowerCase() === 'true',
    baseUrl: envFor(slug, 'BASE_URL')?.trim() || null,
    webhookUrl: envFor(slug, 'WEBHOOK_URL')?.trim() || null,
    webhookSecret: envFor(slug, 'WEBHOOK_SECRET') || null,
    webhookEvents: parseEvents(envFor(slug, 'WEBHOOK_EVENTS')),
    defaultBoardId: envFor(slug, 'DEFAULT_BOARD_ID')?.trim() || null,
    defaultListId: envFor(slug, 'DEFAULT_LIST_ID')?.trim() || null,
  };
}

/** Every configured provider on this Kala instance (for discovery / settings UIs). */
export function listProviderConfigs(): IntegrationProviderConfig[] {
  const providers = new Set<string>();
  for (const name of Object.keys(process.env)) {
    if (!name.startsWith(ENV_PREFIX)) continue;
    const rest = name.slice(ENV_PREFIX.length);
    const match = /^([A-Z0-9_-]+?)_(ENABLED|LABEL|BASE_URL|WEBHOOK_URL|WEBHOOK_SECRET|WEBHOOK_EVENTS|DEFAULT_BOARD_ID|DEFAULT_LIST_ID)$/.exec(rest);
    if (match) providers.add(match[1].toLowerCase().replace(/_/g, '-'));
  }
  return [...providers].sort().map((p) => getProviderConfig(p)).filter((c): c is IntegrationProviderConfig => c !== null);
}

/** Max integration API requests per key per hour (429 beyond it). */
export function rateLimitPerHour(): number {
  const raw = Number.parseInt(process.env.INTEGRATION_RATE_LIMIT_PER_HOUR ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 600;
}
