import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Encryption for users' own API keys at rest: AES-256-GCM with a key derived (HKDF) from
// AI_KEY_ENCRYPTION_SECRET, or from SESSION_SECRET when that is not set. The ciphertext is
// bound to the row it belongs to (userId + provider) as additional authenticated data, so a
// stored value cannot be copied to another user or provider and still decrypt.
//
// Rotating the secret makes existing stored keys unreadable; the affected users simply enter
// their key again in Settings.

function keyMaterial(): Buffer | null {
  const secret =
    (process.env.AI_KEY_ENCRYPTION_SECRET ?? '').trim() ||
    (process.env.SESSION_SECRET ?? '').trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'kala-development-only-secret');
  if (!secret) return null;
  return Buffer.from(hkdfSync('sha256', secret, 'kala-ai-keys', 'user-api-key-encryption-v1', 32));
}

/** Whether users' own keys can be stored on this server. */
export function canStoreUserKeys(): boolean {
  return keyMaterial() !== null;
}

const b64 = (b: Buffer) => b.toString('base64url');

export function encryptSecret(plaintext: string, aad: string): string {
  const key = keyMaterial();
  if (!key) throw new Error('No encryption secret is configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(ciphertext)}`;
}

/** Returns the plaintext, or null if the value is malformed, was tampered with, or the secret changed. */
export function decryptSecret(payload: string, aad: string): string | null {
  try {
    const key = keyMaterial();
    const [version, iv, tag, ciphertext] = payload.split('.');
    if (!key || version !== 'v1' || !iv || !tag || !ciphertext) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
