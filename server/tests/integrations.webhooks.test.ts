import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signWebhookBody, verifyWebhookSignature } from '../src/integrations/webhooks.js';
import {
  clearProviderEnv,
  cleanupTestUsers,
  configureProvider,
  createBoard,
  createKey,
  machine,
  registerUser,
  startWebhookReceiver,
  waitFor,
  type TestUser,
  type WebhookReceiver,
} from './helpers.js';

const SECRET = 'whsec_test_secret';

// Webhooks (§8, §17 Webhooks): minimal signed payloads, only for cards that carry an
// external reference, only for subscribed events.
describe('integration webhooks', () => {
  let receiver: WebhookReceiver;
  let user: TestUser;
  let token: string;
  let board: Awaited<ReturnType<typeof createBoard>>;

  const configure = (overrides: Record<string, string | undefined> = {}) =>
    configureProvider('docarchitect', { LABEL: 'DocArchitect', WEBHOOK_URL: receiver.url, WEBHOOK_SECRET: SECRET, ...overrides });

  const eventFor = (externalId: string, event: string) =>
    waitFor(() =>
      receiver.requests.find(
        (r) => r.body.event === event && (r.body.external_reference as { external_id?: string })?.external_id === externalId
      )
    );

  const noEvent = async (externalId: string, event: string, ms = 400) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return receiver.requests.find(
      (r) => r.body.event === event && (r.body.external_reference as { external_id?: string })?.external_id === externalId
    );
  };

  const createTask = async (externalId: string, listId?: string) => {
    const res = await machine(token).post('/api/integrations/docarchitect/tasks').send({
      title: `Task ${externalId}`,
      description: 'Webhook subject',
      source: 'docarchitect',
      external_id: externalId,
      external_url: `https://docarchitect.test/actions/${externalId}`,
      list_id: listId ?? board.lists.todo,
    });
    if (res.status !== 201) throw new Error(`seed failed: ${res.status} ${res.text}`);
    return res.body as { id: string };
  };

  beforeAll(async () => {
    receiver = await startWebhookReceiver();
    configure();
    user = await registerUser('webhooks');
    board = await createBoard(user.agent, 'Gaia');
    ({ token } = await createKey(user.agent));
  });

  afterAll(async () => {
    await receiver.close();
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('emits card.created with exactly the documented payload and a valid signature', async () => {
    const card = await createTask('A-400');
    const hook = await eventFor('A-400', 'card.created');

    expect(Object.keys(hook.body).sort()).toEqual([
      'card_id',
      'event',
      'external_reference',
      'provider',
      'status',
      'updated_at',
    ]);
    expect(hook.body).toMatchObject({
      provider: 'docarchitect',
      event: 'card.created',
      card_id: card.id,
      status: 'created',
      external_reference: {
        provider: 'docarchitect',
        external_id: 'A-400',
        external_url: 'https://docarchitect.test/actions/A-400',
      },
    });
    expect(hook.body.updated_at).toBeTruthy();

    // Headers: event, delivery id and an HMAC signature over timestamp.body.
    expect(hook.headers['x-kala-event']).toBe('card.created');
    expect(hook.headers['x-kala-delivery']).toBeTruthy();
    const timestamp = String(hook.headers['x-kala-timestamp']);
    const signature = String(hook.headers['x-kala-signature']);
    expect(verifyWebhookSignature(SECRET, timestamp, hook.raw, signature)).toBe(true);
    expect(verifyWebhookSignature('wrong-secret', timestamp, hook.raw, signature)).toBe(false);
    expect(signWebhookBody(SECRET, timestamp, hook.raw)).toBe(signature);
  });

  it('emits card.moved when the card is moved in the Kala UI', async () => {
    const card = await createTask('A-401');
    await user.agent.patch(`/api/cards/${card.id}`).send({ listId: board.lists.doing });
    const hook = await eventFor('A-401', 'card.moved');
    expect(hook.body.status).toBe('in_progress');
  });

  it('emits card.completed when the card reaches a done list', async () => {
    const card = await createTask('A-402', board.lists.doing);
    await user.agent.patch(`/api/cards/${card.id}`).send({ listId: board.lists.done });
    const hook = await eventFor('A-402', 'card.completed');
    expect(hook.body.status).toBe('completed');
    // Kala reports that the work is complete - nothing about the external issue.
    expect(Object.keys(hook.body).sort()).toEqual([
      'card_id',
      'event',
      'external_reference',
      'provider',
      'status',
      'updated_at',
    ]);
  });

  it('emits card.updated when the integration updates fields', async () => {
    await createTask('A-403');
    await machine(token).patch('/api/integrations/docarchitect/tasks/A-403').send({ title: 'Renamed' });
    const hook = await eventFor('A-403', 'card.updated');
    expect(hook.body.status).toBe('todo');
    expect(hook.body).not.toHaveProperty('title'); // no unnecessary card data
  });

  it('emits card.archived when the card is archived in Kala', async () => {
    const card = await createTask('A-404');
    await user.agent.post(`/api/cards/${card.id}/archive`);
    const hook = await eventFor('A-404', 'card.archived');
    expect(hook.body.event).toBe('card.archived');
    await user.agent.post(`/api/cards/${card.id}/restore`);
  });

  it('never emits webhooks for cards without an external reference', async () => {
    const before = receiver.requests.length;
    const res = await user.agent.post('/api/cards').send({ title: 'Plain Kala card', listId: board.lists.todo });
    expect(res.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(receiver.requests.length).toBe(before);
  });

  it('only emits subscribed events (WEBHOOK_EVENTS)', async () => {
    configure({ WEBHOOK_EVENTS: 'card.created' });
    try {
      const card = await createTask('A-405');
      await eventFor('A-405', 'card.created'); // subscribed: delivered
      await user.agent.patch(`/api/cards/${card.id}`).send({ listId: board.lists.doing });
      expect(await noEvent('A-405', 'card.moved')).toBeUndefined(); // not subscribed: skipped
    } finally {
      configure(); // restore all events
    }
  });
});
