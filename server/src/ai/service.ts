import type { BoardRole } from '@prisma/client';
import { getAiConfig } from './config.js';
import { buildBoardContext } from './context.js';
import { ACTION_INSTRUCTIONS, buildSystemPrompt, type CardAction } from './prompts.js';
import { createProvider, type ChatTurn, type LlmProvider } from './providers.js';

// Kala AI service: assembles the board context and the conversation and asks the configured
// provider. It has no write access to anything - it returns text and nothing else.

let provider: LlmProvider | null = null;

function getProvider(): LlmProvider {
  if (!provider) {
    const config = getAiConfig();
    if (!config) throw new Error('Kala AI is not configured');
    provider = createProvider(config);
  }
  return provider;
}

export interface AskInput {
  userId: string;
  boardId: string;
  role: BoardRole;
  messages: ChatTurn[];
  cardId?: string;
  action?: CardAction;
  today?: string;
}

export interface AskResult {
  reply: string;
}

const REFUSED = "Kala AI couldn't answer that request.";

export async function askKalaAi(input: AskInput): Promise<AskResult> {
  // Fresh snapshot for every request, so answers reflect the board as it is right now.
  const { context } = await buildBoardContext({
    boardId: input.boardId,
    userId: input.userId,
    role: input.role,
    today: input.today,
    focusCardId: input.cardId ?? null,
  });

  const system = buildSystemPrompt(JSON.stringify(context), Boolean(input.cardId));

  // For a card action the instruction comes from the server-side table, not from the client.
  const messages = input.messages.map((m) => ({ ...m }));
  if (input.action) {
    const last = messages[messages.length - 1];
    last.content = ACTION_INSTRUCTIONS[input.action];
  }

  const result = await getProvider().complete({ system, messages });

  if (result.refused) return { reply: REFUSED };
  if (!result.text) return { reply: "Kala AI didn't return an answer. Please try again." };
  return {
    reply: result.truncated ? `${result.text}\n\n(The answer was cut off because it was too long. Ask a narrower question for the full answer.)` : result.text,
  };
}
