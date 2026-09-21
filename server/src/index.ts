import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import boardRoutes from './routes/boards.js';
import boardMemberRoutes from './routes/boardMembers.js';
import invitationRoutes from './routes/invitations.js';
import listRoutes from './routes/lists.js';
import cardRoutes from './routes/cards.js';
import workspaceRoutes from './routes/workspaces.js';
import labelRoutes from './routes/labels.js';
import checklistRoutes from './routes/checklist.js';
import realtimeRoutes from './routes/realtime.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'tabla-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set to true in production with HTTPS
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes (unprotected)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/workspaces', requireAuth, workspaceRoutes);
app.use('/api/boards', requireAuth, boardRoutes);
app.use('/api/boards', requireAuth, boardMemberRoutes);
app.use('/api/invitations', requireAuth, invitationRoutes);
app.use('/api/lists', requireAuth, listRoutes);
app.use('/api/cards', requireAuth, cardRoutes);
app.use('/api/labels', requireAuth, labelRoutes);
app.use('/api/checklist', requireAuth, checklistRoutes);
app.use('/api/realtime', requireAuth, realtimeRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
