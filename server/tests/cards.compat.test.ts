import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanupTestUsers,
  clearProviderEnv,
  configureProvider,
  createBoard,
  createKey,
  machine,
  registerUser,
} from './helpers.js';

// Backwards compatibility (§18): normal Kala behaviour is untouched. Existing card
// creation works exactly as before, external references stay optional, and cards
// simply gain an empty (never required) externalReferences list.
describe('existing Kala card behaviour is unchanged', () => {
  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('creates, reads, moves and archives a normal card without any integration config', async () => {
    const user = await registerUser('compat');
    const board = await createBoard(user.agent, 'Legacy');

    const created = await user.agent.post('/api/cards').send({
      title: 'Normal card',
      listId: board.lists.todo,
      description: 'no external identity',
      priority: 'MEDIUM',
    });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Normal card');
    expect(created.body.externalReferences).toEqual([]); // present, optional, empty

    const fetched = await user.agent.get(`/api/cards/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.labels).toEqual([]);
    expect(fetched.body.list.id).toBe(board.lists.todo);

    const moved = await user.agent.patch(`/api/cards/${created.body.id}`).send({ listId: board.lists.doing });
    expect(moved.status).toBe(200);
    expect(moved.body.listId).toBe(board.lists.doing);

    const archived = await user.agent.post(`/api/cards/${created.body.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);

    const deleted = await user.agent.delete(`/api/cards/${created.body.id}`);
    expect(deleted.status).toBe(204);
  });

  it('a board payload still loads with cards and empty external references', async () => {
    const user = await registerUser('compat-board');
    const board = await createBoard(user.agent, 'Board shape');
    await user.agent.post('/api/cards').send({ title: 'First', listId: board.lists.todo });

    const res = await user.agent.get(`/api/boards/${board.boardId}`);
    expect(res.status).toBe(200);
    const cards = res.body.lists.flatMap((l: { cards: unknown[] }) => l.cards);
    expect(cards).toHaveLength(1);
    expect((cards[0] as { externalReferences: unknown[] }).externalReferences).toEqual([]);
  });

  it('an external card is fully manageable through the normal Kala UI routes', async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
    const user = await registerUser('compat-hybrid');
    const board = await createBoard(user.agent, 'Hybrid');
    const { token } = await createKey(user.agent);

    const external = await machine(token).post('/api/integrations/docarchitect/tasks').send({
      title: 'From DocArchitect',
      description: '',
      source: 'docarchitect',
      external_id: 'A-500',
      external_url: 'https://docarchitect.test/actions/A-500',
      list_id: board.lists.todo,
    });
    expect(external.status).toBe(201);

    // The Kala UI can edit it like any other card...
    const edited = await user.agent.patch(`/api/cards/${external.body.id}`).send({ title: 'Renamed in Kala' });
    expect(edited.status).toBe(200);

    // ...and the integration still resolves it by external identity.
    const fetched = await machine(token).get('/api/integrations/docarchitect/tasks/A-500');
    expect(fetched.status).toBe(200);
    expect(fetched.body.title).toBe('Renamed in Kala');
  });
});
