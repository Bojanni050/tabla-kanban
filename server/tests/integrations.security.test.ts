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

// Security (§10, §17 Security): a machine key only ever acts with the permissions of
// the Kala user who issued it - no bypass, no shadow permission system.
describe('integration API isolation between users', () => {
  let victim: TestUser;
  let victimBoard: Awaited<ReturnType<typeof createBoard>>;
  let victimToken: string;
  let attackerToken: string;
  let victimCardId: string;

  beforeAll(async () => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });

    victim = await registerUser('sec-victim');
    victimBoard = await createBoard(victim.agent, 'Confidential');
    ({ token: victimToken } = await createKey(victim.agent));
    const created = await machine(victimToken).post('/api/integrations/docarchitect/tasks').send({
      title: 'Private work',
      description: 'internal',
      source: 'docarchitect',
      external_id: 'A-300',
      external_url: 'https://docarchitect.test/actions/A-300',
      list_id: victimBoard.lists.todo,
    });
    if (created.status !== 201) throw new Error(`seed failed: ${created.status} ${created.text}`);
    victimCardId = created.body.id;

    const attacker = await registerUser('sec-attacker');
    ({ token: attackerToken } = await createKey(attacker.agent));
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('does not list another user board in discovery', async () => {
    const res = await machine(attackerToken).get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(200);
    expect(res.body.map((b: { id: string }) => b.id)).not.toContain(victimBoard.boardId);
  });

  it('cannot read another user board structure (403)', async () => {
    for (const path of ['lists', 'labels', 'members']) {
      const res = await machine(attackerToken).get(`/api/integrations/docarchitect/boards/${victimBoard.boardId}/${path}`);
      expect(res.status, path).toBe(403);
      expect(res.text).not.toContain('Confidential');
    }
  });

  it('cannot read a task by external id (403, no card data)', async () => {
    const res = await machine(attackerToken).get('/api/integrations/docarchitect/tasks/A-300');
    expect(res.status).toBe(403);
    expect(res.text).not.toContain('Private work');
    expect(res.text).not.toContain(victimCardId);
  });

  it('cannot update a foreign task (403)', async () => {
    const res = await machine(attackerToken).patch('/api/integrations/docarchitect/tasks/A-300').send({ title: 'Hijacked' });
    expect(res.status).toBe(403);
    const check = await machine(victimToken).get('/api/integrations/docarchitect/tasks/A-300');
    expect(check.body.title).toBe('Private work');
  });

  it('cannot create a card on a foreign list (403)', async () => {
    const res = await machine(attackerToken).post('/api/integrations/docarchitect/tasks').send({
      title: 'Planted',
      description: '',
      source: 'docarchitect',
      external_id: 'A-301',
      external_url: 'https://docarchitect.test/actions/A-301',
      list_id: victimBoard.lists.todo,
    });
    expect(res.status).toBe(403);
    // The external identity was not consumed either.
    const retry = await machine(victimToken).post('/api/integrations/docarchitect/tasks').send({
      title: 'Legit',
      description: '',
      source: 'docarchitect',
      external_id: 'A-301',
      external_url: 'https://docarchitect.test/actions/A-301',
      list_id: victimBoard.lists.todo,
    });
    expect(retry.status).toBe(201);
    expect(retry.body.title).toBe('Legit');
  });

  it('never echoes the token back in responses', async () => {
    const list = await machine(attackerToken).get('/api/integrations/docarchitect/boards');
    expect(list.text).not.toContain(attackerToken);
    const tasks = await machine(attackerToken).get('/api/integrations/docarchitect/tasks/A-300');
    expect(tasks.text).not.toContain(attackerToken);
  });
});
