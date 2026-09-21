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
import aiRoutes from './routes/ai.js';
import aiSettingsRoutes from './routes/aiSettings.js';
import { describeAiConfig } from './ai/config.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// The session secret must come from the environment in production. The fallback below
// is only for local development and must never be used to sign real sessions.
const DEV_SESSION_SECRET = 'tabla-dev-secret-change-in-production';
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? '' : DEV_SESSION_SECRET);
if (!sessionSecret || (isProduction && sessionSecret === DEV_SESSION_SECRET)) {
  console.error('SESSION_SECRET must be set to a long random value when NODE_ENV=production');
  process.exit(1);
}

app.disable('x-powered-by');
// In production the app runs behind a reverse proxy (nginx) that terminates the public
// connection, so trust its X-Forwarded-* headers (needed for secure cookies over HTTPS).
if (isProduction) app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true', // set COOKIE_SECURE=true when served over HTTPS
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
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/ai', requireAuth, aiSettingsRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(describeAiConfig());
});

export default app;
