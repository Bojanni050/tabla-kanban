import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearProviderEnv,
  cleanupTestUsers,
  configureProvider,
  createBoard,
  createKey,
  machine,
  registerUser,
  type TestUser,
} from './helpers.js';

// Retrieval by external identity (§5, §17 Retrieval).
describe('integration task retrieval', () => {
  let user: TestUser;
  let token: string;
  let board: Awaited<ReturnType<typeof createBoard>>;
  let created: { id: string };

  beforeAll(async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
    user = await registerUser('retrieve');
    board = await createBoard(user.agent, 'Gaia');
    ({ token } = await createKey(user.agent));
    const res = await machine(token).post('/api/integrations/docarchitect/tasks').send({
      title: 'Update Gaia architecture documentation',
      description: 'Sync docs with the current topology.',
      source: 'docarchitect',
      external_id: 'A-031',
      external_url: 'https://docarchitect.test/actions/A-031',
      list_id: board.lists.doing,
      priority: 'MEDIUM',
      due_date: '2026-11-01T00:00:00.000Z',
    });
    if (res.status !== 201) throw new Error(`seed failed: ${res.status} ${res.text}`);
    created = res.body;
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('returns the full synchronization payload for a known external id', async () => {
    const res = await machine(token).get('/api/integrations/docarchitect/tasks/A-031');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      title: 'Update Gaia architecture documentation',
      description: 'Sync docs with the current topology.',
      status: 'in_progress', // Doing normalizes to in_progress
      priority: 'MEDIUM',
      due_date: '2026-11-01T00:00:00.000Z',
      archived: false,
      board: { id: board.boardId, name: 'Gaia' },
      list: { id: board.lists.doing, title: 'Doing' },
      external_reference: {
        provider: 'docarchitect',
        external_id: 'A-031',
        external_url: 'https://docarchitect.test/actions/A-031',
        metadata: null,
      },
    });
    expect(res.body.created_at).toBeTruthy();
    expect(res.body.updated_at).toBeTruthy();
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(Array.isArray(res.body.labels)).toBe(true);
  });

  it('returns 404 with a machine-readable code for an unknown external id', async () => {
    const res = await machine(token).get('/api/integrations/docarchitect/tasks/A-999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(res.body.error).toBeTruthy();
    expect(res.body.stack).toBeUndefined(); // never a stack trace
  });

  it('namespaces external ids per provider', async () => {
    configureProvider('github');
    try {
      const { token: githubToken } = await createKey(user.agent, 'github');
      const res = await machine(githubToken).get('/api/integrations/github/tasks/A-031');
      expect(res.status).toBe(404); // A-031 exists under docarchitect, not github
    } finally {
      // leave docarchitect configured for later tests in this file
    }
  });
});
