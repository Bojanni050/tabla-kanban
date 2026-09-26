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

// Normalized integration status (§7, §17 Status): Kala lists stay the workflow model;
// the integration API exposes a configurable normalized status on top of them.
describe('integration status synchronization', () => {
  let user: TestUser;
  let token: string;
  let board: Awaited<ReturnType<typeof createBoard>>;
  let cardId: string;

  beforeAll(async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
    user = await registerUser('status');
    board = await createBoard(user.agent, 'Gaia');
    ({ token } = await createKey(user.agent));
    const res = await machine(token).post('/api/integrations/docarchitect/tasks').send({
      title: 'Status task',
      description: '',
      source: 'docarchitect',
      external_id: 'A-200',
      external_url: 'https://docarchitect.test/actions/A-200',
      list_id: board.lists.todo,
    });
    if (res.status !== 201) throw new Error(`seed failed: ${res.status} ${res.text}`);
    cardId = res.body.id;
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  const getStatus = async () => {
    const res = await machine(token).get('/api/integrations/docarchitect/tasks/A-200');
    expect(res.status).toBe(200);
    return res.body as { status: string; list: { id: string }; archived: boolean };
  };

  it('discovery exposes each list normalized status', async () => {
    const res = await machine(token).get(`/api/integrations/docarchitect/boards/${board.boardId}/lists`);
    expect(res.status).toBe(200);
    const byTitle = Object.fromEntries(res.body.map((l: { title: string; status: string }) => [l.title, l.status]));
    expect(byTitle).toEqual({ 'To Do': 'todo', Doing: 'in_progress', Done: 'completed' });
  });

  it('a task starts as todo in its list', async () => {
    expect((await getStatus()).status).toBe('todo');
  });

  it('follows a card moved between workflow states in Kala', async () => {
    // Move like the Kala UI does (drag between lists).
    const moved = await user.agent.patch(`/api/cards/${cardId}`).send({ listId: board.lists.doing });
    expect(moved.status).toBe(200);
    expect((await getStatus()).status).toBe('in_progress');

    const done = await user.agent.patch(`/api/cards/${cardId}`).send({ listId: board.lists.done });
    expect(done.status).toBe(200);
    expect((await getStatus()).status).toBe('completed');

    const back = await user.agent.patch(`/api/cards/${cardId}`).send({ listId: board.lists.todo });
    expect(back.status).toBe(200);
    expect((await getStatus()).status).toBe('todo');
  });

  it('accepts a normalized status on update and resolves it to a list', async () => {
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-200').send({
      status: 'in_progress',
    });
    expect(res.status).toBe(200);
    expect(res.body.list.id).toBe(board.lists.doing);
    expect(res.body.status).toBe('in_progress');
  });

  it('rejects a status no list maps to (422)', async () => {
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-200').send({
      status: 'cancelled', // this board has no cancelled-like list
    });
    expect(res.status).toBe(422);
    expect(res.body.details[0].message).toMatch(/maps to status 'cancelled'/);
  });

  it('the mapping is configurable via INTEGRATION_STATUS_MAP', async () => {
    process.env.INTEGRATION_STATUS_MAP = JSON.stringify({ Doing: 'completed' });
    const { reloadStatusOverrides } = await import('../src/integrations/status.js');
    reloadStatusOverrides();
    try {
      expect((await getStatus()).status).toBe('completed'); // "Doing" now maps to completed
      const lists = await machine(token).get(`/api/integrations/docarchitect/boards/${board.boardId}/lists`);
      const doing = lists.body.find((l: { title: string }) => l.title === 'Doing');
      expect(doing.status).toBe('completed');
    } finally {
      delete process.env.INTEGRATION_STATUS_MAP;
      reloadStatusOverrides();
    }
  });

  it('reports archived separately from status', async () => {
    const archive = await user.agent.post(`/api/cards/${cardId}/archive`);
    expect(archive.status).toBe(200);
    const state = await getStatus();
    expect(state.archived).toBe(true);
    expect(state.status).toBe('in_progress'); // still in Doing; archived is orthogonal
    await user.agent.post(`/api/cards/${cardId}/restore`);
  });
});
