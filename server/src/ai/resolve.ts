import { getPreset, type ApiStyle, type ProviderId } from './catalog.js';
import { getAiConfig, getServerProvider } from './config.js';
import { getUserKey, getUserSelection } from './userSettings.js';

// Works out which provider, model and API key a request from a given user should use.
//
//   1. If the user chose a provider/model in Settings: their own saved key for that provider,
//      otherwise the server's key for it. No key at all -> a clear error (no silent fallback).
//   2. Otherwise the server default from the environment (AI_PROVIDER / AI_MODEL / ...).

export interface ResolvedAi {
  provider: ProviderId;
  label: string;
  style: ApiStyle;
  model: string;
  apiKey: string;
  baseUrl: string | null;
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Whose key is used: the user's own (their cost) or the server's (the administrator's cost). */
  keySource: 'user' | 'server';
  /** Whether the user chose this provider/model themselves, or it is the server default. */
  choice: 'user' | 'default';
  /** Anthropic reasoning effort - only ever applied to the administrator's default configuration. */
  effort: string | null;
}

export type ResolveFailure = 'not_configured' | 'no_key' | 'unreadable_key';

export type Resolution = { ok: true; ai: ResolvedAi } | { ok: false; reason: ResolveFailure; label?: string };

type KeyLookup = { key: string; source: 'user' | 'server' } | 'unreadable' | null;

/** The key a user would use for a provider: their own if saved, else the server's. */
export async function keyForProvider(userId: string, provider: ProviderId): Promise<KeyLookup> {
  const own = await getUserKey(userId, provider);
  if (own.status === 'unreadable') return 'unreadable';
  if (own.status === 'ok') return { key: own.key, source: 'user' };
  const serverKey = getServerProvider(provider)?.apiKey;
  return serverKey ? { key: serverKey, source: 'server' } : null;
}

export async function resolveAiForUser(userId: string): Promise<Resolution> {
  const config = getAiConfig();
  const selection = await getUserSelection(userId);

  const provider = selection ? selection.provider : config.defaultProvider;
  const model = selection ? selection.model : config.defaultModel;
  if (!provider || !model) return { ok: false, reason: 'not_configured' };

  const preset = getPreset(provider);
  const server = getServerProvider(provider); // undefined when e.g. "custom" is not configured
  if (!preset || !server) return { ok: false, reason: 'no_key', label: preset?.label };

  const key = await keyForProvider(userId, provider);
  if (key === 'unreadable') return { ok: false, reason: 'unreadable_key', label: server.label };
  if (!key) return { ok: false, reason: selection ? 'no_key' : 'not_configured', label: server.label };

  return {
    ok: true,
    ai: {
      provider,
      label: server.label,
      style: preset.style,
      model,
      apiKey: key.key,
      baseUrl: server.baseUrl,
      tokenParam: preset.tokenParam,
      keySource: key.source,
      choice: selection ? 'user' : 'default',
      effort: !selection && preset.style === 'anthropic' ? config.effort : null,
    },
  };
}
