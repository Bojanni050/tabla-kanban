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

// Integration discovery (§13): authorized callers learn ids instead of hardcoding them.
describe('integration discovery', () => {
  let user: TestUser;
  let token: string;
  let board: Awaited<ReturnType<typeof createBoard>>;

  beforeAll(async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
    user = await registerUser('discovery');
    board = await createBoard(user.agent, 'Gaia');
    ({ token } = await createKey(user.agent));
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('lists only the boards the key user can see', async () => {
    // Another user's board exists before the discovery call.
    const stranger = await registerUser('discovery-stranger');
    const strangerBoard = await createBoard(stranger.agent, 'Secret');

    const res = await machine(token).get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(200);
    const ids = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(board.boardId);
    expect(ids).not.toContain(strangerBoard.boardId);
  });

  it('lists labels of a board', async () => {
    const res = await machine(token).get(`/api/integrations/docarchitect/boards/${board.boardId}/labels`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: board.labelId, name: 'docs', color: '#0ea5e9' }]);
  });

  it('lists members of a board where permitted', async () => {
    const res = await machine(token).get(`/api/integrations/docarchitect/boards/${board.boardId}/members`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ email: user.email, role: 'OWNER' });
    expect(res.body[0].id).toBeTruthy();
  });

  it('denies discovery on a board the key user cannot access (403)', async () => {
    const stranger = await registerUser('discovery-foreign');
    const foreign = await createBoard(stranger.agent, 'Not yours');
    const res = await machine(token).get(`/api/integrations/docarchitect/boards/${foreign.boardId}/lists`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/access/i);
  });

  it('returns 404 for an unknown board id', async () => {
    const res = await machine(token).get('/api/integrations/docarchitect/boards/00000000-0000-4000-8000-000000000000/lists');
    expect(res.status).toBe(404);
  });
});
