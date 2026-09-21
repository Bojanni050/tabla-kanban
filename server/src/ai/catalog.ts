// The AI providers Kala AI can talk to.
//
// Base URLs are FIXED here (or set by the server administrator through an environment
// variable). A user can choose a provider, a model and their own API key in Settings, but can
// never supply a URL: that would let any signed-in user make the server call arbitrary
// addresses (SSRF).
//
// Everything except Anthropic speaks the OpenAI chat-completions format ("OpenAI-compatible"),
// so one adapter covers OpenAI, OpenRouter, Google Gemini, Eden AI and any custom endpoint the
// administrator configures. Anthropic keeps its native SDK adapter.

export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'edenai' | 'custom';
export type ApiStyle = 'anthropic' | 'openai';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  style: ApiStyle;
  /** Fixed API base URL; null means "the SDK default" (Anthropic) or "set by the administrator" (custom). */
  baseUrl: string | null;
  /** Suggested model id, prefilled in Settings. Users may type any model id the provider offers. */
  defaultModel: string;
  /** Prefix of the environment variables: <PREFIX>_API_KEY and <PREFIX>_BASE_URL. Always AI_-prefixed, so
   *  Kala never picks up ANTHROPIC_API_KEY / OPENAI_API_KEY etc. that belong to other tools on the machine. */
  envPrefix: string;
  /** Output-token parameter name. OpenAI's newer models require max_completion_tokens; gateways expect max_tokens. */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Where a user can create an API key. */
  keyHelpUrl: string | null;
}

export const PRESETS: readonly ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    style: 'anthropic',
    baseUrl: null,
    defaultModel: 'claude-opus-5',
    envPrefix: 'AI_ANTHROPIC',
    tokenParam: 'max_tokens',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    style: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    envPrefix: 'AI_OPENAI',
    tokenParam: 'max_completion_tokens',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    style: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    envPrefix: 'AI_OPENROUTER',
    tokenParam: 'max_tokens',
    keyHelpUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    style: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    envPrefix: 'AI_GOOGLE',
    tokenParam: 'max_tokens',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'edenai',
    label: 'Eden AI',
    style: 'openai',
    baseUrl: 'https://api.edenai.run/v3',
    defaultModel: 'google/gemini-2.5-flash',
    envPrefix: 'AI_EDENAI',
    tokenParam: 'max_tokens',
    keyHelpUrl: 'https://app.edenai.run/user/register',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    style: 'openai',
    baseUrl: null, // set by the administrator with AI_CUSTOM_BASE_URL
    defaultModel: '',
    envPrefix: 'AI_CUSTOM',
    tokenParam: 'max_tokens',
    keyHelpUrl: null,
  },
];

export const PROVIDER_IDS: readonly ProviderId[] = PRESETS.map((p) => p.id);

export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value as ProviderId);
}

// A model id as accepted by the providers: letters, digits and . _ : / @ + - only.
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,119}$/;

// A pasted API key: printable ASCII without spaces, a sensible length.
export const API_KEY_RE = /^[\x21-\x7E]{8,512}$/;
