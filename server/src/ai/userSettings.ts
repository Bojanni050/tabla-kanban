import prisma from '../db.js';
import { isProviderId, type ProviderId } from './catalog.js';
import { decryptSecret, encryptSecret } from './crypto.js';

// Persistence for a user's Kala AI preferences: which provider/model they chose, and their own
// API keys. This is the ONLY part of the AI code that writes to the database, and it only
// touches the two settings tables (UserAiSettings, UserAiKey) - never board data. Answering
// questions (context.ts, service.ts, providers.ts) stays strictly read-only.

// Binds each stored ciphertext to its row, so it cannot be moved to another user or provider.
const aad = (userId: string, provider: ProviderId) => `${userId}:${provider}`;

export interface UserSelection {
  provider: ProviderId;
  model: string;
}

export async function getUserSelection(userId: string): Promise<UserSelection | null> {
  const row = await prisma.userAiSettings.findUnique({ where: { userId } });
  if (!row || !isProviderId(row.provider)) return null;
  return { provider: row.provider, model: row.model };
}

export async function saveUserSelection(userId: string, provider: ProviderId, model: string): Promise<void> {
  await prisma.userAiSettings.upsert({
    where: { userId },
    create: { userId, provider, model },
    update: { provider, model },
  });
}

export async function clearUserSelection(userId: string): Promise<void> {
  await prisma.userAiSettings.deleteMany({ where: { userId } });
}

/** Which providers the user has saved a key for, with the last 4 characters as a display hint. */
export async function listUserKeyHints(userId: string): Promise<Map<ProviderId, string>> {
  const rows = await prisma.userAiKey.findMany({ where: { userId }, select: { provider: true, keyLast4: true } });
  const hints = new Map<ProviderId, string>();
  for (const row of rows) if (isProviderId(row.provider)) hints.set(row.provider, row.keyLast4);
  return hints;
}

export async function saveUserKey(userId: string, provider: ProviderId, apiKey: string): Promise<void> {
  const keyCiphertext = encryptSecret(apiKey, aad(userId, provider));
  const keyLast4 = apiKey.slice(-4);
  await prisma.userAiKey.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, keyCiphertext, keyLast4 },
    update: { keyCiphertext, keyLast4 },
  });
}

export async function deleteUserKey(userId: string, provider: ProviderId): Promise<void> {
  await prisma.userAiKey.deleteMany({ where: { userId, provider } });
}

export type UserKeyLookup = { status: 'none' } | { status: 'ok'; key: string } | { status: 'unreadable' };

export async function getUserKey(userId: string, provider: ProviderId): Promise<UserKeyLookup> {
  const row = await prisma.userAiKey.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!row) return { status: 'none' };
  const key = decryptSecret(row.keyCiphertext, aad(userId, provider));
  // A key that cannot be decrypted (secret rotated, or the row was tampered with) is reported,
  // never silently replaced by the server's key.
  return key ? { status: 'ok', key } : { status: 'unreadable' };
}
