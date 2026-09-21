import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authorizeBoard } from '../middleware/access.js';
import { wrap } from '../middleware/async.js';
import { getAiConfig, isAiEnabled } from '../ai/config.js';
import { CardNotOnBoardError } from '../ai/context.js';
import { CARD_ACTIONS } from '../ai/prompts.js';
import { AiProviderError } from '../ai/providers.js';
import { allowRequest } from '../ai/rateLimit.js';
import { askKalaAi } from '../ai/service.js';

// Kala AI endpoints (mounted at /api/ai behind requireAuth).
//
// Frontend -> this route -> Kala AI service -> LLM provider. The browser never talks to the
// provider and never sees the API key. Kala AI is read-only: nothing in here writes to the
// database, and the model has no tools.

const router = Router();

// GET /api/ai/status - lets the UI know whether Kala AI is set up on this server.
router.get('/status', (_req: Request, res: Response) => {
  res.json({ enabled: isAiEnabled() });
});

const chatSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1, 'Message cannot be empty').max(4000, 'Message is too long'),
        })
      )
      .min(1)
      .max(20),
    cardId: z.string().min(1).max(100).optional(),
    action: z.enum(CARD_ACTIONS).optional(),
    // The user's local date (YYYY-MM-DD), so "overdue" matches what they see in the UI.
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((body) => body.messages.at(-1)?.role === 'user', {
    message: 'The last message must be from the user',
  })
  .refine((body) => !body.action || Boolean(body.cardId), { message: 'A card action needs a cardId' });

// POST /api/ai/boards/:boardId/chat
router.post('/boards/:boardId/chat', wrap(async (req: Request, res: Response) => {
  const boardId = req.params.boardId;

  // 1. Authenticated (requireAuth) + a member of this board with at least read access.
  //    Viewers may use Kala AI: it only reads, exactly what they may already see.
  if (!(await authorizeBoard(req, res, boardId, 'view'))) return;

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const body = parsed.data;

  const config = getAiConfig();
  if (!config) {
    res.status(503).json({ error: 'Kala AI is not set up on this server yet.' });
    return;
  }

  if (!allowRequest(req.userId!, config.maxRequestsPerHour)) {
    res.status(429).json({ error: 'You have reached the hourly limit for Kala AI. Please try again later.' });
    return;
  }

  try {
    const { reply } = await askKalaAi({
      userId: req.userId!,
      boardId,
      role: req.boardRole!,
      messages: body.messages,
      cardId: body.cardId,
      action: body.action,
      today: body.today,
    });
    res.json({ reply });
  } catch (error) {
    if (error instanceof CardNotOnBoardError) {
      res.status(404).json({ error: 'Card not found on this board' });
      return;
    }
    if (error instanceof AiProviderError) {
      // Log the kind only - never prompts, board data or credentials.
      console.error(`[kala-ai] provider request failed: ${error.kind}${error.status ? ` (HTTP ${error.status})` : ''}`);
      if (error.kind === 'rate_limit') {
        res.status(503).json({ error: 'Kala AI is busy right now. Please try again in a moment.' });
      } else if (error.kind === 'auth' || error.kind === 'bad_request') {
        res.status(502).json({ error: 'Kala AI is not configured correctly on the server. Please contact the administrator.' });
      } else {
        res.status(502).json({ error: "Kala AI couldn't complete that request. Please try again." });
      }
      return;
    }
    throw error;
  }
}));

export default router;
