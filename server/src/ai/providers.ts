import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from './config.js';

// LLM provider adapters. The rest of Kala AI only sees the small interface below, so the
// provider can be swapped with AI_PROVIDER without touching prompts, context or routes.
// Only the backend ever talks to a provider - the API key never reaches the browser.

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

function kindForStatus(status: number | undefined): AiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 400 || status === 404 || status === 422) return 'bad_request';
  if (status === undefined || status >= 500 || status === 408 || status === 409) return 'unavailable';
  return 'other';
}

// ---- Anthropic (official SDK) ---------------------------------------------------------------

function anthropicProvider(config: AiConfig): LlmProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 1,
    timeout: config.timeoutMs,
  });

  return {
    async complete({ system, messages }) {
      try {
        const response = await client.messages.create({
          model: config.model,
          max_tokens: config.maxTokens,
          // The board context is large and identical across the turns of a conversation, so
          // mark it cacheable (a no-op below the model's minimum cacheable size).
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages,
          ...(config.effort ? { output_config: { effort: config.effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' } } : {}),
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

// ---- OpenAI (chat completions; also works with OpenAI-compatible servers via AI_BASE_URL) ----

interface OpenAiChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

function openAiProvider(config: AiConfig): LlmProvider {
  const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

  return {
    async complete({ system, messages }) {
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model: config.model,
            max_completion_tokens: config.maxTokens,
            messages: [{ role: 'system', content: system }, ...messages],
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch {
        throw new AiProviderError('unavailable');
      }
      if (!res.ok) throw new AiProviderError(kindForStatus(res.status), res.status);

      const data = (await res.json().catch(() => ({}))) as OpenAiChatResponse;
      const choice = data.choices?.[0];
      return {
        text: (choice?.message?.content ?? '').trim(),
        refused: choice?.finish_reason === 'content_filter',
        truncated: choice?.finish_reason === 'length',
      };
    },
  };
}

export function createProvider(config: AiConfig): LlmProvider {
  return config.provider === 'openai' ? openAiProvider(config) : anthropicProvider(config);
}
