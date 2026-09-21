// Kala AI configuration - everything comes from environment variables, nothing is hard-coded.
//
//   AI_PROVIDER              anthropic (default) | openai
//   AI_MODEL                 model id; defaults to claude-opus-5 for anthropic, gpt-5 for openai
//   AI_API_KEY               provider API key (server-side only, never sent to the browser)
//   AI_BASE_URL              optional API base URL (proxies, OpenAI-compatible servers, tests)
//   AI_EFFORT                optional Anthropic effort: low | medium | high | xhigh | max
//                            (only for models that support it; leave unset otherwise)
//   AI_MAX_REQUESTS_PER_HOUR per-user request limit (default 60)
//
// Kala AI is "enabled" only when an API key is present. Without one the feature is off and
// the rest of the application is unaffected.

export type AiProviderName = 'anthropic' | 'openai';

export interface AiConfig {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
  effort?: string;
  maxTokens: number;
  timeoutMs: number;
  maxRequestsPerHour: number;
}

const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
};

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

let cached: { config: AiConfig | null; problem: string | null } | null = null;

function load(): { config: AiConfig | null; problem: string | null } {
  const apiKey = (process.env.AI_API_KEY ?? '').trim();
  if (!apiKey) return { config: null, problem: null }; // simply not configured

  const providerRaw = (process.env.AI_PROVIDER ?? 'anthropic').trim().toLowerCase();
  if (providerRaw !== 'anthropic' && providerRaw !== 'openai') {
    return { config: null, problem: `AI_PROVIDER "${providerRaw}" is not supported (use anthropic or openai)` };
  }
  const provider: AiProviderName = providerRaw;

  const effort = (process.env.AI_EFFORT ?? '').trim().toLowerCase();
  if (effort && !EFFORTS.has(effort)) {
    return { config: null, problem: `AI_EFFORT "${effort}" is not valid (use low, medium, high, xhigh or max)` };
  }

  const perHour = Number.parseInt(process.env.AI_MAX_REQUESTS_PER_HOUR ?? '', 10);

  return {
    config: {
      provider,
      model: (process.env.AI_MODEL ?? '').trim() || DEFAULT_MODELS[provider],
      apiKey,
      baseUrl: (process.env.AI_BASE_URL ?? '').trim() || undefined,
      effort: effort || undefined,
      // Room for the answer plus any model-side reasoning.
      maxTokens: 8000,
      timeoutMs: 90_000,
      maxRequestsPerHour: Number.isFinite(perHour) && perHour > 0 ? perHour : 60,
    },
    problem: null,
  };
}

export function getAiConfig(): AiConfig | null {
  if (!cached) cached = load();
  return cached.config;
}

export function isAiEnabled(): boolean {
  return getAiConfig() !== null;
}

/** One-line description for the start-up log. Never includes the API key. */
export function describeAiConfig(): string {
  if (!cached) cached = load();
  if (cached.problem) return `Kala AI disabled: ${cached.problem}`;
  const c = cached.config;
  return c ? `Kala AI enabled (provider: ${c.provider}, model: ${c.model})` : 'Kala AI disabled (AI_API_KEY is not set)';
}
