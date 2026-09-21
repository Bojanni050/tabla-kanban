import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError, kindForStatus, openAiHeaders } from './providers.js';
import type { ResolvedAi } from './resolve.js';

// Lists the models a provider offers, so Settings can show a picker. The request uses the same
// fixed base URL and the user's (or the server's) key. Results are cached briefly per key.

const TTL_MS = 10 * 60 * 1000;
const MAX_MODELS = 500;
const cache = new Map<string, { at: number; ids: string[] }>();

type ModelSource = Pick<ResolvedAi, 'provider' | 'style' | 'apiKey' | 'baseUrl'>;

export async function listModels(source: ModelSource): Promise<string[]> {
  const cacheKey = `${source.provider}:${createHash('sha256').update(source.apiKey).digest('hex').slice(0, 16)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;

  const ids = source.style === 'anthropic' ? await listAnthropic(source) : await listOpenAiCompatible(source);
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS);
  cache.set(cacheKey, { at: Date.now(), ids: sorted });
  return sorted;
}

async function listAnthropic(source: ModelSource): Promise<string[]> {
  const client = new Anthropic({ apiKey: source.apiKey, baseURL: source.baseUrl ?? undefined, maxRetries: 0, timeout: 15_000 });
  try {
    const ids: string[] = [];
    for await (const model of client.models.list({ limit: 100 })) {
      ids.push(model.id);
      if (ids.length >= MAX_MODELS) break;
    }
    return ids;
  } catch (error) {
    throw new AiProviderError(error instanceof Anthropic.APIError ? kindForStatus(error.status) : 'unavailable', error instanceof Anthropic.APIError ? error.status : undefined);
  }
}

async function listOpenAiCompatible(source: ModelSource): Promise<string[]> {
  const base = (source.baseUrl ?? '').replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/models`, { headers: openAiHeaders(source), signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AiProviderError('unavailable');
  }
  if (!res.ok) throw new AiProviderError(kindForStatus(res.status), res.status);

  const data = (await res.json().catch(() => ({}))) as { data?: { id?: unknown }[]; models?: { id?: unknown; name?: unknown }[] };
  const raw = [...(data.data ?? []), ...(data.models ?? [])];
  return raw
    .map((m) => (typeof m.id === 'string' ? m.id : typeof (m as { name?: unknown }).name === 'string' ? ((m as { name: string }).name) : ''))
    // Google lists ids as "models/gemini-2.5-flash"; chat requests use the bare id.
    .map((id) => id.replace(/^models\//, ''))
    .filter((id) => id.length > 0 && id.length <= 120);
}
