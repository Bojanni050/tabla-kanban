import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearProviderEnv,
  cleanupTestUsers,
  configureProvider,
  createBoard,
  createKey,
  machine,
  newAgent,
  registerUser,
  type TestUser,
} from './helpers.js';

// Card creation from an external system (§2, §4, §12, §17 Creation).
describe('integration task creation', () => {
  let user: TestUser;
  let token: string;
  let board: Awaited<ReturnType<typeof createBoard>>;

  beforeAll(async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
    user = await registerUser('create');
    board = await createBoard(user.agent, 'Gaia');
    ({ token } = await createKey(user.agent));
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  const baseBody = (over: Record<string, unknown> = {}) => ({
    title: 'Update Gaia architecture documentation',
    description: 'Bring the architecture docs in line with the current topology.',
    source: 'docarchitect',
    external_id: 'A-031',
    external_url: 'https://docarchitect.test/actions/A-031',
    board_id: board.boardId,
    list_id: board.lists.todo,
    label_ids: [board.labelId],
    priority: 'HIGH',
    due_date: '2026-10-15T00:00:00.000Z',
    ...over,
  });

  it('creates a card with an external reference', async () => {
    const res = await machine(token).post('/api/integrations/docarchitect/tasks').send(baseBody());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Update Gaia architecture documentation',
      description: 'Bring the architecture docs in line with the current topology.',
      status: 'created',
      priority: 'HIGH',
      due_date: '2026-10-15T00:00:00.000Z',
      archived: false,
      board: { id: board.boardId, name: 'Gaia' },
      list: { id: board.lists.todo, title: 'To Do' },
      external_reference: {
        provider: 'docarchitect',
        external_id: 'A-031',
        external_url: 'https://docarchitect.test/actions/A-031',
      },
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.created_at).toBeTruthy();
    expect(res.body.updated_at).toBeTruthy();
    expect(res.body.members).toEqual([]);
    expect(res.body.labels).toHaveLength(1);
    expect(res.body.labels[0].id).toBe(board.labelId);

    // The card exists in Kala and carries its external identity (UI can show it).
    const card = await user.agent.get(`/api/cards/${res.body.id}`);
    expect(card.status).toBe(200);
    expect(card.body.externalReferences).toHaveLength(1);
    expect(card.body.externalReferences[0]).toMatchObject({
      provider: 'docarchitect',
      externalId: 'A-031',
      externalUrl: 'https://docarchitect.test/actions/A-031',
    });
  });

  it('is idempotent: a duplicate create returns the existing card, no duplicate', async () => {
    const first = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-032', title: 'Second action' }));
    expect(first.status).toBe(201);

    const second = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-032', title: 'Second action (retried)' }));
    expect(second.status).toBe(200);
    expect(second.headers['x-idempotent-replay']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.title).toBe('Second action'); // original wins, retry does not overwrite

    // Exactly one card with this external identity exists.
    const all = await user.agent.get(`/api/boards/${board.boardId}`);
    const cards = all.body.lists.flatMap((l: { cards: { id: string }[] }) => l.cards);
    const matches = cards.filter((c: { id: string }) => c.id === first.body.id);
    expect(matches).toHaveLength(1);
  });

  it('rejects an unknown board with a validation error (422, never creates one)', async () => {
    const before = await user.agent.get(`/api/boards/${board.boardId}`);
    const res = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-033', board_id: '00000000-0000-4000-8000-000000000000', list_id: undefined }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation_error');
    expect(res.body.details[0].field).toBe('board_id');
    const after = await user.agent.get(`/api/boards/${board.boardId}`);
    expect(after.body.lists).toHaveLength(before.body.lists.length);
  });

  it('rejects an unknown list with a validation error (422)', async () => {
    const res = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-034', list_id: '00000000-0000-4000-8000-000000000000' }));
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('list_id');
  });

  it('rejects a list that does not belong to the given board (422)', async () => {
    const other = await createBoard(user.agent, 'Other');
    const res = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-035', list_id: other.lists.todo }));
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('list_id');
  });

  it('rejects invalid data with field-level details (422)', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ title: '' }, 'title'],
      [{ description: undefined }, 'description'],
      [{ external_id: '' }, 'external_id'],
      [{ external_url: 'not-a-url' }, 'external_url'],
      [{ source: 'github' }, 'source'],
      [{ priority: 'URGENT' }, 'priority'],
      [{ due_date: 'sometime soon' }, 'due_date'],
      [{ external_id: 'A-040', list_id: 'does-not-exist' }, 'list_id'],
    ];
    for (const [override, field] of cases) {
      const res = await machine(token)
        .post('/api/integrations/docarchitect/tasks')
        .send(baseBody({ external_id: 'A-041', ...override }));
      expect(res.status, JSON.stringify(override)).toBe(422);
      expect(res.body.code).toBe('validation_error');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    }
  });

  it('rejects labels from another board and non-member assignees (422)', async () => {
    const other = await createBoard(user.agent, 'Other2');
    const labelRes = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-042', label_ids: [other.labelId] }));
    expect(labelRes.status).toBe(422);
    expect(labelRes.body.details[0].field).toBe('label_ids');

    const memberRes = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-043', member_ids: ['00000000-0000-4000-8000-000000000001'] }));
    expect(memberRes.status).toBe(422);
    expect(memberRes.body.details[0].field).toBe('member_ids');

    const multiRes = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-044', member_ids: ['user-a', 'user-b'] }));
    expect(multiRes.status).toBe(422);
    expect(multiRes.body.details[0].field).toBe('member_ids');
  });

  it('assigns a single member when they are a board member', async () => {
    const me = await user.agent.get('/api/auth/me');
    const res = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-045', member_ids: [me.body.id] }));
    expect(res.status).toBe(201);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe(user.email);
  });

  it('rejects creation without placement when no default is configured (422)', async () => {
    const res = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-046', board_id: undefined, list_id: undefined }));
    expect(res.status).toBe(422);
    expect(res.body.details[0].message).toMatch(/list_id or board_id is required/);
  });

  it('uses the configured default placement when the caller omits board and list', async () => {
    configureProvider('docarchitect', {
      LABEL: 'DocArchitect',
      DEFAULT_BOARD_ID: board.boardId,
      DEFAULT_LIST_ID: board.lists.doing,
    });
    try {
      const res = await machine(token)
        .post('/api/integrations/docarchitect/tasks')
        .send(baseBody({ external_id: 'A-047', board_id: undefined, list_id: undefined }));
      expect(res.status).toBe(201);
      expect(res.body.list.id).toBe(board.lists.doing);
    } finally {
      configureProvider('docarchitect', { LABEL: 'DocArchitect', DEFAULT_BOARD_ID: undefined, DEFAULT_LIST_ID: undefined });
    }
  });

  it('falls back to the first list when only a board is given', async () => {
    const res = await machine(token)
      .post('/api/integrations/docarchitect/tasks')
      .send(baseBody({ external_id: 'A-048', list_id: undefined, board_id: board.boardId }));
    expect(res.status).toBe(201);
    expect(res.body.list.id).toBe(board.lists.todo); // first list by position
  });

  it('rejects a machine route without any key (401)', async () => {
    const plain = await newAgent().get('/api/integrations/docarchitect/boards');
    expect(plain.status).toBe(401);
  });
});
