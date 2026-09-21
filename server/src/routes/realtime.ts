import { Router, Request, Response } from 'express';
import { authorizeBoard } from '../middleware/access.js';
import { subscribe, unsubscribe } from '../realtime.js';

const router = Router();

// GET /api/realtime?boardId=... - open a Server-Sent Events stream for a board.
//
// The session cookie authenticates the connection (same mechanism as the REST
// API) and authorizeBoard guarantees the caller is a member of the board
// before any event can be received. The client-supplied boardId is never
// trusted on its own.
router.get('/', async (req: Request, res: Response) => {
  const boardId = typeof req.query.boardId === 'string' ? req.query.boardId : '';
  if (!boardId) {
    res.status(400).json({ error: 'boardId is required' });
    return;
  }
  if (!(await authorizeBoard(req, res, boardId, 'view'))) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Ask EventSource to wait 5s between automatic reconnection attempts.
  res.write('retry: 5000\n\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ boardId })}\n\n`);

  const sub = { res, userId: req.userId! };
  subscribe(boardId, sub);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // The connection is gone; req 'close' will clean up.
    }
  }, 25000);
  // Don't keep the process alive for SSE connections alone.
  (heartbeat as unknown as { unref?: () => void }).unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe(boardId, sub);
  });
});

export default router;
