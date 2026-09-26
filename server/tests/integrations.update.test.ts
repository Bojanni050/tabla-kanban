import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '../src/db.js';
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

// Updates through the integration API (§6, §17 Updates) - including Kala's existing
// permission model: a VIEWER must not be able to update a card.
describe('integration task updates', () => {
  let owner: TestUser;
  let token: string;
  let board: Awaited<ReturnType<typeof createBoard>>;
  let cardId: string;

  const createTask = async (externalId: string, over: Record<string, unknown> = {}) => {
    const res = await machine(token).post('/api/integrations/docarchitect/tasks').send({
      title: `Task ${externalId}`,
      description: 'Original description',
      source: 'docarchitect',
      external_id: externalId,
      external_url: `https://docarchitect.test/actions/${externalId}`,
      list_id: board.lists.todo,
      ...over,
    });
    if (res.status !== 201) throw new Error(`seed failed: ${res.status} ${res.text}`);
    return res.body as { id: string };
  };

  beforeAll(async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
    owner = await registerUser('update');
    board = await createBoard(owner.agent, 'Gaia');
    ({ token } = await createKey(owner.agent));
    cardId = (await createTask('A-100')).id;
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('updates title, description, priority and due date', async () => {
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-100').send({
      title: 'Updated title',
      description: 'Updated description',
      priority: 'low', // case-insensitive
      due_date: '2026-12-01T00:00:00.000Z',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: cardId,
      title: 'Updated title',
      description: 'Updated description',
      priority: 'LOW',
      due_date: '2026-12-01T00:00:00.000Z',
      status: 'todo',
    });
    // Kala itself reflects the change (same store, no shadow state).
    const card = await owner.agent.get(`/api/cards/${cardId}`);
    expect(card.body.title).toBe('Updated title');
    expect(card.body.priority).toBe('LOW');
  });

  it('clears priority and due date with null', async () => {
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-100').send({
      priority: null,
      due_date: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBeNull();
    expect(res.body.due_date).toBeNull();
  });

  it('rejects invalid updates with a validation error (422)', async () => {
    const invalid: Array<[Record<string, unknown>, string]> = [
      [{ priority: 'URGENT' }, 'priority'],
      [{ due_date: 'not a date' }, 'due_date'],
      [{ title: '' }, 'title'],
      [{ status: 'created' }, 'status'],
      [{ status: 'todo', list_id: board.lists.doing }, 'status'],
      [{ status: 'finished' }, 'status'],
    ];
    for (const [body, field] of invalid) {
      const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-100').send(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.code).toBe('validation_error');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    }
  });

  it('rejects an unknown external id with 404', async () => {
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-999').send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('moves the card to an explicit list', async () => {
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-100').send({
      list_id: board.lists.doing,
    });
    expect(res.status).toBe(200);
    expect(res.body.list.id).toBe(board.lists.doing);
    expect(res.body.status).toBe('in_progress');
    const card = await owner.agent.get(`/api/cards/${cardId}`);
    expect(card.body.listId).toBe(board.lists.doing);
  });

  it('refuses to move a card to a list on another board (422)', async () => {
    const other = await createBoard(owner.agent, 'Other');
    const res = await machine(token).patch('/api/integrations/docarchitect/tasks/A-100').send({
      list_id: other.lists.todo,
    });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('list_id');
  });

  it("respects Kala's permissions: a VIEWER key cannot update (403)", async () => {
    // A second Kala user with VIEWER role on the board gets their own key.
    const viewer = await registerUser('update-viewer');
    await prisma.boardMember.create({
      data: { boardId: board.boardId, userId: (await viewer.agent.get('/api/auth/me')).body.id, role: 'VIEWER' },
    });
    const viewerKey = await createKey(viewer.agent);

    const forbidden = await machine(viewerKey.token)
      .patch('/api/integrations/docarchitect/tasks/A-100')
      .send({ title: 'Nope' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatch(/role|access/i);

    // The same key may still read the task.
    const allowed = await machine(viewerKey.token).get('/api/integrations/docarchitect/tasks/A-100');
    expect(allowed.status).toBe(200);
  });
});
