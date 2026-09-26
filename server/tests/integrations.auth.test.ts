import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearProviderEnv,
  cleanupTestUsers,
  configureProvider,
  createKey,
  machine,
  registerUser,
} from './helpers.js';

// Authentication and provider gating for the integration API (§17 Authentication).
describe('integration API authentication', () => {
  beforeAll(() => {
    configureProvider();
  });

  afterAll(async () => {
    await clearProviderEnv();
    await cleanupTestUsers();
  });

  it('rejects a request without a key (401)', async () => {
    const res = await machine('').get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('rejects a garbage key (401)', async () => {
    const res = await machine('kala_it_not-a-real-token').get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('accepts a valid key (200)', async () => {
    const user = await registerUser('auth-ok');
    const key = await createKey(user.agent);
    const res = await machine(key.token).get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects a revoked key (401)', async () => {
    const user = await registerUser('auth-revoked');
    const key = await createKey(user.agent);
    // Works before revocation...
    expect((await machine(key.token).get('/api/integrations/docarchitect/boards')).status).toBe(200);
    const revoke = await user.agent.delete(`/api/integrations/keys/${key.id}`);
    expect(revoke.status).toBe(204);
    // ...and fails immediately after.
    const res = await machine(key.token).get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it("rejects a key used for another provider (403 provider_mismatch)", async () => {
    const user = await registerUser('auth-mismatch');
    const key = await createKey(user.agent, 'docarchitect');
    configureProvider('github');
    const res = await machine(key.token).get('/api/integrations/github/boards');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('provider_mismatch');
  });

  it('rejects calls to an unknown provider (404)', async () => {
    const user = await registerUser('auth-unknown');
    const key = await createKey(user.agent, 'docarchitect');
    const res = await machine(key.token).get('/api/integrations/nope/boards');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('rejects calls to a disabled provider (403 provider_disabled)', async () => {
    const user = await registerUser('auth-disabled');
    const key = await createKey(user.agent, 'docarchitect');
    configureProvider('docarchitect', { ENABLED: 'false' });
    const res = await machine(key.token).get('/api/integrations/docarchitect/boards');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('provider_disabled');
    configureProvider('docarchitect', { ENABLED: 'true' });
  });

  it('rate limits a key (429 + Retry-After)', async () => {
    const user = await registerUser('auth-rl');
    const key = await createKey(user.agent);
    process.env.INTEGRATION_RATE_LIMIT_PER_HOUR = '3';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await machine(key.token).get('/api/integrations/docarchitect/boards');
        statuses.push(res.status);
        if (res.status === 429) {
          expect(res.body.code).toBe('rate_limited');
          expect(res.headers['retry-after']).toBeDefined();
        }
      }
      expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
      expect(statuses[3]).toBe(429);
    } finally {
      delete process.env.INTEGRATION_RATE_LIMIT_PER_HOUR;
    }
  });

  it('does not let a machine key use a session route without a session', async () => {
    const res = await machine('kala_it_whatever').get('/api/integrations/keys');
    expect(res.status).toBe(401);
  });
});
