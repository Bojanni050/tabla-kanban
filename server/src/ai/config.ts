import { PRESETS, getPreset, isProviderId, type ProviderId, type ProviderPreset } from './catalog.js';

// Kala AI server configuration, read from environment variables. Nothing is hard-coded and no
// key ever leaves the server.
//
// Per provider (optional):
//   AI_ANTHROPIC_API_KEY, AI_OPENAI_API_KEY, AI_OPENROUTER_API_KEY, AI_GOOGLE_API_KEY, AI_EDENAI_API_KEY
//   AI_<PROVIDER>_BASE_URL              override a provider's API URL (proxy, gateway)
// (All variables are AI_-prefixed on purpose: standard names such as ANTHROPIC_API_KEY or
//  ANTHROPIC_BASE_URL are NOT read, so credentials meant for other tools are never picked up.)
//   AI_CUSTOM_BASE_URL / AI_CUSTOM_API_KEY / AI_CUSTOM_LABEL
//                                       any OpenAI-compatible endpoint (only the administrator can set the URL)
// Server default, used by users who have not chosen anything in Settings:
//   AI_PROVIDER   which provider is the default (else the first one that has a server key)
//   AI_MODEL      model for the default provider (else that provider's suggested model)
//   AI_API_KEY    legacy shorthand: the API key of AI_PROVIDER (default anthropic)
//   AI_BASE_URL   legacy shorthand: the API URL of AI_PROVIDER
// General:
//   AI_EFFORT                 optional Anthropic effort (low|medium|high|xhigh|max) for the server default
//   AI_MAX_REQUESTS_PER_HOUR  per-user limit for requests that use a SERVER key (default 60)
//   AI_KEY_ENCRYPTION_SECRET  secret that encrypts users' own API keys at rest (defaults to SESSION_SECRET)
//
// A provider is usable by a user if the server has a key for it or the user saved their own.

export interface ServerProvider {
  preset: ProviderPreset;
  /** Effective base URL (env override, else the preset's); null = SDK default. */
  baseUrl: string | null;
  /** Server-side key, if the administrator configured one. */
  apiKey: string | null;
  /** Shown in Settings; the custom provider's label can be renamed. */
  label: string;
}

export interface AiServerConfig {
  providers: ServerProvider[]; // in catalog order; custom only when a base URL is configured
  defaultProvider: ProviderId | null;
  defaultModel: string | null;
  effort: string | null;
  maxTokens: number;
  timeoutMs: number;
  maxRequestsPerHour: number;
  problem: string | null; // a configuration mistake worth logging at start-up
}

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const env = (name: string): string => (process.env[name] ?? '').trim();

function load(): AiServerConfig {
  const problems: string[] = [];

  // Legacy shorthand variables apply to AI_PROVIDER (default: anthropic).
  const legacyProviderRaw = env('AI_PROVIDER').toLowerCase();
  let legacyProvider: ProviderId = 'anthropic';
  if (legacyProviderRaw) {
    if (isProviderId(legacyProviderRaw)) legacyProvider = legacyProviderRaw;
    else problems.push(`AI_PROVIDER "${legacyProviderRaw}" is not supported (use one of: ${PRESETS.map((p) => p.id).join(', ')})`);
  }

  const providers: ServerProvider[] = [];
  for (const preset of PRESETS) {
    const prefix = preset.envPrefix;
    const legacyKey = preset.id === legacyProvider ? env('AI_API_KEY') : '';
    const legacyBase = preset.id === legacyProvider ? env('AI_BASE_URL') : '';
    const baseUrl = env(`${prefix}_BASE_URL`) || legacyBase || preset.baseUrl;
    if (preset.id === 'custom' && !baseUrl) continue; // the custom provider only exists when configured
    providers.push({
      preset,
      baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : null,
      apiKey: env(`${prefix}_API_KEY`) || legacyKey || null,
      label: preset.id === 'custom' ? env('AI_CUSTOM_LABEL') || preset.label : preset.label,
    });
  }

  // Server default: the named provider, otherwise the first that has a key.
  let defaultProvider: ProviderId | null = null;
  if (legacyProviderRaw && isProviderId(legacyProviderRaw)) {
    defaultProvider = providers.find((p) => p.preset.id === legacyProviderRaw && p.apiKey)?.preset.id ?? null;
  } else {
    defaultProvider = providers.find((p) => p.apiKey)?.preset.id ?? null;
  }
  const defaultPreset = defaultProvider ? getPreset(defaultProvider) : undefined;

  const effort = env('AI_EFFORT').toLowerCase();
  if (effort && !EFFORTS.has(effort)) problems.push(`AI_EFFORT "${effort}" is not valid (use low, medium, high, xhigh or max)`);

  const perHour = Number.parseInt(env('AI_MAX_REQUESTS_PER_HOUR'), 10);

  return {
    providers,
    defaultProvider,
    defaultModel: defaultPreset ? env('AI_MODEL') || defaultPreset.defaultModel || null : null,
    effort: effort && EFFORTS.has(effort) ? effort : null,
    // Room for the answer plus any model-side reasoning.
    maxTokens: 8000,
    timeoutMs: 90_000,
    maxRequestsPerHour: Number.isFinite(perHour) && perHour > 0 ? perHour : 60,
    problem: problems.length ? problems.join('; ') : null,
  };
}

let cached: AiServerConfig | null = null;

export function getAiConfig(): AiServerConfig {
  if (!cached) cached = load();
  return cached;
}

export function getServerProvider(id: ProviderId): ServerProvider | undefined {
  return getAiConfig().providers.find((p) => p.preset.id === id);
}

/** One-line description for the start-up log. Never includes a key. */
export function describeAiConfig(): string {
  const c = getAiConfig();
  const withKey = c.providers.filter((p) => p.apiKey).map((p) => p.preset.id);
  const parts = [
    withKey.length ? `server keys: ${withKey.join(', ')}` : 'no server API keys',
    c.defaultProvider ? `default: ${c.defaultProvider} (${c.defaultModel})` : 'no server default',
    'users can add their own keys in Settings',
  ];
  return `Kala AI - ${parts.join('; ')}${c.problem ? ` [config warning: ${c.problem}]` : ''}`;
}
