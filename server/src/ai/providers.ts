import Anthropic from '@anthropic-ai/sdk';
import { getAiConfig } from './config.js';
import type { ResolvedAi } from './resolve.js';

// LLM provider adapters. The rest of Kala AI only sees the small interface below, so the
// provider can change without touching prompts, context or routes.
//
//   anthropic -> the official Anthropic SDK (native Messages API)
//   everything else -> ONE OpenAI-compatible adapter (chat completions): OpenAI, OpenRouter,
//                      Google Gemini, Eden AI and custom endpoints
//
// Only the backend ever talks to a provider - API keys never reach the browser.

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: ChatTurn[];
}

export interface LlmResult {
  text: string;
  /** The provider declined to answer. */
  refused: boolean;
  /** The answer hit the output limit and was cut off. */
  truncated: boolean;
}

export type AiErrorKind = 'auth' | 'rate_limit' | 'unavailable' | 'bad_request' | 'other';

/** A provider failure, reduced to a kind that is safe to act on (no payloads, no keys). */
export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    public readonly status?: number
  ) {
    super(`AI provider error (${kind}${status ? `, HTTP ${status}` : ''})`);
  }
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResult>;
}

export function kindForStatus(status: number | undefined): AiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 400 || status === 404 || status === 422) return 'bad_request';
  if (status === undefined || status >= 500 || status === 408 || status === 409) return 'unavailable';
  return 'other';
}

// ---- Anthropic (official SDK) ---------------------------------------------------------------

function anthropicProvider(ai: ResolvedAi): LlmProvider {
  const { maxTokens, timeoutMs } = getAiConfig();
  const client = new Anthropic({
    apiKey: ai.apiKey,
    baseURL: ai.baseUrl ?? undefined,
    maxRetries: 1,
    timeout: timeoutMs,
  });

  return {
    async complete({ system, messages }) {
      try {
        const response = await client.messages.create({
          model: ai.model,
          max_tokens: maxTokens,
          // The board context is large and identical across the turns of a conversation, so
          // mark it cacheable (a no-op below the model's minimum cacheable size).
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages,
          ...(ai.effort ? { output_config: { effort: ai.effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' } } : {}),
        });

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim();

        return {
          text,
          refused: response.stop_reason === 'refusal',
          truncated: response.stop_reason === 'max_tokens',
        };
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw new AiProviderError(kindForStatus(error.status), error.status);
        }
        // Connection errors, timeouts, anything else from the SDK.
        throw new AiProviderError('unavailable');
      }
    },
  };
}

// ---- OpenAI-compatible chat completions -----------------------------------------------------

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown; refusal?: string | null }; finish_reason?: string }[];
}

/** Message content is normally a string; some gateways return an array of text parts. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('');
  }
  return '';
}

export function openAiHeaders(ai: Pick<ResolvedAi, 'provider' | 'apiKey'>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ai.apiKey}`,
  };
  if (ai.provider === 'openrouter') {
    // Optional attribution headers OpenRouter uses for its app rankings.
    const site = (process.env.KALA_PUBLIC_URL ?? '').trim();
    if (site) headers['HTTP-Referer'] = site;
    headers['X-OpenRouter-Title'] = 'Kala';
  }
  return headers;
}

function openAiCompatibleProvider(ai: ResolvedAi): LlmProvider {
  const { maxTokens, timeoutMs } = getAiConfig();
  const base = (ai.baseUrl ?? '').replace(/\/+$/, '');

  return {
    async complete({ system, messages }) {
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: openAiHeaders(ai),
          body: JSON.stringify({
            model: ai.model,
            [ai.tokenParam]: maxTokens,
            messages: [{ role: 'system', content: system }, ...messages],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new AiProviderError('unavailable');
      }
      if (!res.ok) throw new AiProviderError(kindForStatus(res.status), res.status);

      const data = (await res.json().catch(() => ({}))) as ChatCompletionResponse;
      const choice = data.choices?.[0];
      return {
        text: contentText(choice?.message?.content).trim(),
        refused: choice?.finish_reason === 'content_filter' || Boolean(choice?.message?.refusal),
        truncated: choice?.finish_reason === 'length',
      };
    },
  };
}

export function createProvider(ai: ResolvedAi): LlmProvider {
  return ai.style === 'anthropic' ? anthropicProvider(ai) : openAiCompatibleProvider(ai);
}
