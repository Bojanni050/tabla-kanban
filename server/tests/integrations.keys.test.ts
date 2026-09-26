import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearProviderEnv,
  cleanupTestUsers,
  configureProvider,
  createKey,
  newAgent,
  registerUser,
} from './helpers.js';

// Key management (session-authenticated) - §10: configurable, revocable, never
// exposed after creation, never in responses.
describe('integration key management', () => {
  beforeAll(() => {
    configureProvider('docarchitect', { LABEL: 'DocArchitect' });
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('creates a key, returns the token exactly once, and never again', async () => {
    const user = await registerUser('keys-create');
    const created = await user.agent.post('/api/integrations/keys').send({ provider: 'docarchitect', name: 'DocArchitect prod' });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^kala_it_[A-Za-z0-9_-]+$/);
    expect(created.body.token_prefix).toBe(created.body.token.slice(0, 14));

    const list = await user.agent.get('/api/integrations/keys');
    expect(list.status).toBe(200);
    expect(list.text).not.toContain(created.body.token); // plaintext never again
    const entry = list.body.find((k: { id: string }) => k.id === created.body.id);
    expect(entry).toMatchObject({ name: 'DocArchitect prod', provider: 'docarchitect', revoked: false });
    expect(entry.token).toBeUndefined();
    expect(entry.token_prefix).toBeDefined();
  });

  it('requires a session (401)', async () => {
    const res = await newAgent().post('/api/integrations/keys').send({ provider: 'docarchitect' });
    expect(res.status).toBe(401);
  });

  it('revokes only the caller own keys (404 for foreign keys)', async () => {
    const owner = await registerUser('keys-owner');
    const other = await registerUser('keys-other');
    const key = await createKey(owner.agent);

    const foreignDelete = await other.agent.delete(`/api/integrations/keys/${key.id}`);
    expect(foreignDelete.status).toBe(404);

    const ownDelete = await owner.agent.delete(`/api/integrations/keys/${key.id}`);
    expect(ownDelete.status).toBe(204);

    // Revoking twice is still a clean response, not an error path leak.
    const again = await owner.agent.delete(`/api/integrations/keys/${key.id}`);
    expect(again.status).toBe(204);
  });

  it('exposes configured providers without secrets', async () => {
    const user = await registerUser('keys-providers');
    const res = await user.agent.get('/api/integrations/providers');
    expect(res.status).toBe(200);
    const doc = res.body.find((p: { provider: string }) => p.provider === 'docarchitect');
    expect(doc).toMatchObject({
      provider: 'docarchitect',
      label: 'DocArchitect',
      enabled: true,
      base_url: 'https://docarchitect.test',
      webhook: { configured: false },
    });
    expect(res.text).not.toContain('secret');
    expect(res.text).not.toContain('WEBHOOK_SECRET');
  });

  it('label falls back to the provider slug when not configured', async () => {
    const user = await registerUser('keys-label');
    configureProvider('github');
    const res = await user.agent.get('/api/integrations/providers');
    const github = res.body.find((p: { provider: string }) => p.provider === 'github');
    expect(github.label).toBe('Github');
  });
});
