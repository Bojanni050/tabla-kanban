import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';
import app from '../src/index.js';
import prisma from '../src/db.js';

export { app, prisma };

/** supertest agent with a cookie jar (keeps the Kala session between requests). */
export function newAgent() {
  return supertest.agent(app);
}

export type Agent = ReturnType<typeof newAgent>;

let counter = 0;

export function uniqueEmail(prefix = 'it'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}-${randomBytes(3).toString('hex')}@example.test`;
}

export interface TestUser {
  agent: Agent;
  email: string;
}

/** Registers a fresh Kala user (gets a default workspace and a session). */
export async function registerUser(prefix = 'it'): Promise<TestUser> {
  const agent = newAgent();
  const email = uniqueEmail(prefix);
  const res = await agent.post('/api/auth/register').send({ email, password: 'test-password-1' });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${res.text}`);
  }
  return { agent, email };
}

export interface TestBoard {
  boardId: string;
  lists: { todo: string; doing: string; done: string };
  labelId: string;
}

/** A board with three workflow lists (To Do / Doing / Done) and one label. */
export async function createBoard(agent: Agent, name = 'Gaia'): Promise<TestBoard> {
  const ws = await agent.post('/api/workspaces').send({ name: `WS ${name}` });
  if (ws.status !== 201) throw new Error(`workspace create failed: ${ws.status} ${ws.text}`);
  const board = await agent.post('/api/boards').send({ name, workspaceId: ws.body.id });
  if (board.status !== 201) throw new Error(`board create failed: ${board.status} ${board.text}`);
  const boardId = board.body.id as string;

  const mkList = async (title: string) => {
    const res = await agent.post('/api/lists').send({ title, boardId });
    if (res.status !== 201) throw new Error(`list create failed: ${res.status} ${res.text}`);
    return res.body.id as string;
  };
  const todo = await mkList('To Do');
  const doing = await mkList('Doing');
  const done = await mkList('Done');

  const label = await agent.post('/api/labels').send({ name: 'docs', color: '#0ea5e9', boardId });
  if (label.status !== 201) throw new Error(`label create failed: ${label.status} ${label.text}`);

  return { boardId, lists: { todo, doing, done }, labelId: label.body.id as string };
}

// ---------------------------------------------------------------------------
// Provider configuration (read lazily by integrations/config.ts)
// ---------------------------------------------------------------------------

export const PROVIDER = 'docarchitect';
const ENV_PREFIX = 'INTEGRATION_';

/** Configures a provider through the environment; returns the keys that were set. */
export function configureProvider(
  provider = PROVIDER,
  overrides: Record<string, string | undefined> = {}
): string[] {
  const envKey = (setting: string) => `${ENV_PREFIX}${provider.toUpperCase().replace(/-/g, '_')}_${setting}`;
  const values: Record<string, string | undefined> = {
    [envKey('ENABLED')]: 'true',
    [envKey('BASE_URL')]: 'https://docarchitect.test',
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [envKey(k), v])),
  };
  const touched: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    touched.push(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return touched;
}

/** Removes every INTEGRATION_* variable (and refreshes cached status overrides). */
export async function clearProviderEnv(): Promise<void> {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(ENV_PREFIX)) delete process.env[key];
  }
  const { reloadStatusOverrides } = await import('../src/integrations/status.js');
  reloadStatusOverrides();
}

/** Issues an integration API key for the agent's user. */
export async function createKey(agent: Agent, provider = PROVIDER, name?: string) {
  const res = await agent.post('/api/integrations/keys').send({ provider, name });
  if (res.status !== 201) throw new Error(`key create failed: ${res.status} ${res.text}`);
  return res.body as {
    id: string;
    token: string;
    token_prefix: string;
    provider: string;
    name: string;
  };
}

/** Machine request helper authenticated with an integration key. */
export function machine(token: string) {
  const req = supertest(app);
  return {
    get: (path: string) => req.get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => req.post(path).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => req.patch(path).set('Authorization', `Bearer ${token}`),
  };
}

// ---------------------------------------------------------------------------
// Webhook receiver + polling
// ---------------------------------------------------------------------------

export interface CapturedWebhook {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  /** Raw request body, for signature verification (must match byte-for-byte). */
  raw: string;
}

export interface WebhookReceiver {
  url: string;
  requests: CapturedWebhook[];
  close: () => Promise<void>;
}

export async function startWebhookReceiver(): Promise<WebhookReceiver> {
  const requests: CapturedWebhook[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        requests.push({ headers: req.headers, body: JSON.parse(raw || '{}'), raw });
      } catch {
        requests.push({ headers: req.headers, body: {}, raw });
      }
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/webhook`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Polls `fn` until it returns a value, or fails after `timeoutMs`. */
export async function waitFor<T>(
  fn: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await fn();
    if (last !== undefined && last !== null && last !== false) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms (last value: ${JSON.stringify(last)})`);
}

/** Deletes every user created by these tests; boards, cards and keys cascade. */
export async function cleanupTestUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { endsWith: '@example.test' } } });
}
