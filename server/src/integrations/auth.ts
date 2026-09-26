import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import prisma from '../db.js';
import { allowRequest } from '../ai/rateLimit.js';
import { getProviderConfig, rateLimitPerHour, normalizeProvider } from './config.js';
import { IntegrationError, sendIntegrationError, unauthorized, notFound } from './errors.js';

// Machine-to-machine authentication for the integration API.
//
// There is no second identity system: an integration API key is issued by a Kala user
// and every request it makes runs as that user (req.userId), so the existing
// BoardMember role checks in middleware/access.ts govern everything it can see or do.
// The token itself is only stored as a SHA-256 hash - it is shown once when the key is
// created and is never returned (or logged) again. Revocation is a row update.

export interface IntegrationAuth {
  keyId: string;
  name: string;
  provider: string;
  userId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireIntegrationKey on authenticated integration requests. */
    integration?: IntegrationAuth;
  }
}

const TOKEN_PREFIX = 'kala_it_';

/** Mints a new token. Returns the plaintext (to be shown once) and its stored hash. */
export function mintToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashToken(token), tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function extractToken(req: Request): string | null {
  const auth = req.header('authorization');
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const alt = req.header('x-kala-key');
  return alt ? alt.trim() : null;
}

/**
 * Authenticates a machine request for the provider in `req.params[param]`:
 * valid, unrevoked key -> provider must be configured, enabled and match the key.
 * On success req.userId / req.integration are set and the per-key rate limit applies.
 */
export function requireIntegrationKey(param = 'provider'): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractToken(req);
      if (!token) throw unauthorized();

      const key = await prisma.integrationKey.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!key || key.revokedAt) throw unauthorized();

      const provider = normalizeProvider(req.params[param]);
      if (!provider) throw notFound('Unknown integration provider');
      const config = getProviderConfig(provider);
      if (!config) throw notFound('Unknown integration provider');
      if (!config.enabled) {
        throw new IntegrationError(403, 'provider_disabled', `Integration '${provider}' is not enabled on this Kala instance`);
      }
      if (key.provider !== provider) {
        throw new IntegrationError(403, 'provider_mismatch', `This API key is for provider '${key.provider}', not '${provider}'`);
      }

      if (!allowRequest(`integration:${key.id}`, rateLimitPerHour())) {
        const retryAfter = 60;
        res.setHeader('Retry-After', String(retryAfter));
        throw new IntegrationError(429, 'rate_limited', `Rate limit exceeded. Retry in ${retryAfter}s`);
      }

      // Fire-and-forget usage marker; never blocks the request and never logs the token.
      prisma.integrationKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

      req.userId = key.userId;
      req.integration = { keyId: key.id, name: key.name, provider, userId: key.userId };
      next();
    } catch (err) {
      sendIntegrationError(res, err);
    }
  };
}

/** Wraps an async integration handler so thrown IntegrationErrors become JSON responses. */
export function integrationHandler(
  fn: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return (req, res) => {
    fn(req, res).catch((err) => sendIntegrationError(res, err));
  };
}
