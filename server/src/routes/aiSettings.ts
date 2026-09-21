import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/async.js';
import { API_KEY_RE, MODEL_ID_RE, isProviderId, type ProviderId } from '../ai/catalog.js';
import { getAiConfig, getServerProvider } from '../ai/config.js';
import { canStoreUserKeys } from '../ai/crypto.js';
import { listModels } from '../ai/models.js';
import { AiProviderError } from '../ai/providers.js';
import { allowRequest } from '../ai/rateLimit.js';
import { keyForProvider, resolveAiForUser } from '../ai/resolve.js';
import {
  clearUserSelection,
  deleteUserKey,
  getUserSelection,
  listUserKeyHints,
  saveUserKey,
  saveUserSelection,
} from '../ai/userSettings.js';

// Per-user Kala AI settings (mounted at /api/ai): which provider and model a user chose and,
// optionally, their own API key. Keys are encrypted at rest and NEVER returned - the API only
// reports whether a key exists and its last 4 characters.
//
// Providers are a fixed catalog with fixed base URLs. Users cannot supply a URL.

const router = Router();

async function settingsPayload(userId: string) {
  const config = getAiConfig();
  const [selection, hints, resolution] = await Promise.all([
    getUserSelection(userId),
    listUserKeyHints(userId),
    resolveAiForUser(userId),
  ]);
  return {
    canStoreKeys: canStoreUserKeys(),
    providers: config.providers.map((p) => ({
      id: p.preset.id,
      label: p.label,
      defaultModel: p.preset.defaultModel,
      openaiCompatible: p.preset.style === 'openai',
      hasServerKey: Boolean(p.apiKey),
      hasUserKey: hints.has(p.preset.id),
      keyHint: hints.get(p.preset.id) ?? null,
      keyHelpUrl: p.preset.keyHelpUrl,
    })),
    selection,
    serverDefault: config.defaultProvider ? { provider: config.defaultProvider, model: config.defaultModel } : null,
    effective: resolution.ok
      ? { ok: true as const, provider: resolution.ai.label, model: resolution.ai.model, keySource: resolution.ai.keySource, choice: resolution.ai.choice }
      : { ok: false as const, reason: resolution.reason, provider: resolution.label ?? null },
  };
}

// GET /api/ai/settings
router.get('/settings', wrap(async (req: Request, res: Response) => {
  res.json(await settingsPayload(req.userId!));
}));

const saveSchema = z.object({
  provider: z.string().refine(isProviderId, 'Unknown provider'),
  model: z.string().trim().regex(MODEL_ID_RE, 'Enter a valid model id (letters, digits and . _ : / - only)'),
  // Optional: a new key to save. Omit it to keep the key that is already saved.
  apiKey: z.string().trim().regex(API_KEY_RE, 'That does not look like a valid API key').optional(),
});

// PUT /api/ai/settings - choose provider + model, optionally saving the user's own key
router.put('/settings', wrap(async (req: Request, res: Response) => {
  const userId = req.userId!;
  if (!allowRequest(`settings:${userId}`, 60)) {
    res.status(429).json({ error: 'Too many changes. Please try again later.' });
    return;
  }

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const provider = parsed.data.provider as ProviderId;
  const server = getServerProvider(provider); // undefined when the custom endpoint is not configured
  if (!server) {
    res.status(400).json({ error: 'That provider is not available on this server' });
    return;
  }

  const newKey = parsed.data.apiKey;
  if (newKey && !canStoreUserKeys()) {
    res.status(400).json({ error: 'Saving your own API key is not available on this server' });
    return;
  }

  // The choice must be usable: a new key, a key saved earlier, or a key configured on the server.
  const hasUsableKey = Boolean(newKey) || (await listUserKeyHints(userId)).has(provider) || Boolean(server.apiKey);
  if (!hasUsableKey) {
    res.status(400).json({ error: `Add an API key for ${server.label} to use it` });
    return;
  }

  if (newKey) await saveUserKey(userId, provider, newKey);
  await saveUserSelection(userId, provider, parsed.data.model);
  res.json(await settingsPayload(userId));
}));

// DELETE /api/ai/settings - go back to the server default (saved keys are kept)
router.delete('/settings', wrap(async (req: Request, res: Response) => {
  await clearUserSelection(req.userId!);
  res.json(await settingsPayload(req.userId!));
}));

// DELETE /api/ai/settings/keys/:provider - remove the user's own key for one provider
router.delete('/settings/keys/:provider', wrap(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  if (!isProviderId(provider)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  await deleteUserKey(req.userId!, provider);
  res.json(await settingsPayload(req.userId!));
}));

// GET /api/ai/models?provider=openrouter - the models a provider offers (for the model picker)
router.get('/models', wrap(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const provider = typeof req.query.provider === 'string' ? req.query.provider : '';
  const server = isProviderId(provider) ? getServerProvider(provider) : undefined;
  if (!isProviderId(provider) || !server) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  if (!allowRequest(`models:${userId}`, 30)) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }

  const key = await keyForProvider(userId, provider);
  if (key === 'unreadable') {
    res.status(409).json({ error: `Your saved ${server.label} API key can no longer be read. Please enter it again.` });
    return;
  }
  if (!key) {
    res.status(400).json({ error: `Add an API key for ${server.label} first, then load its models.` });
    return;
  }

  try {
    const models = await listModels({ provider, style: server.preset.style, apiKey: key.key, baseUrl: server.baseUrl });
    res.json({ models });
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error(`[kala-ai] listing ${provider} models failed: ${error.kind}${error.status ? ` (HTTP ${error.status})` : ''}`);
      res.status(502).json({
        error:
          error.kind === 'auth'
            ? `${server.label} rejected the API key.`
            : `Couldn't load the model list from ${server.label}. You can still type a model id.`,
      });
      return;
    }
    throw error;
  }
}));

export default router;
