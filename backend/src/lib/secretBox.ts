import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encryption for subscription keys (license keys, account numbers, customer ids).
 *
 * - AES-256-GCM with a random 96-bit IV per value; stored as "v1.<iv>.<tag>.<ciphertext>" (base64url).
 * - The AES key and the HMAC key are derived separately from SUBSCRIPTION_KEY_SECRET with HKDF,
 *   so the search hash can never be used to recover the encryption key.
 * - `hash` is a keyed HMAC of the normalised value, so subscriptions can be found by an exact
 *   key without decrypting every row (and without a plain SHA-256 that could be brute-forced
 *   offline from a database dump).
 *
 * Plain values must never be logged or put in notifications. See src/lib/logger.ts redaction.
 */
export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(sealed: string): string;
  hash(plain: string): string;
}

const VERSION = 'v1';

function derive(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'dueora.subscription-key', purpose, 32));
}

/** Keys are compared case-insensitively and ignoring surrounding/inner whitespace and dashes. */
export function normaliseKey(plain: string): string {
  return plain.replace(/[\s-]+/g, '').toUpperCase();
}

export function createSecretBox(secret: string): SecretBox {
  if (secret.length < 32) throw new Error('SUBSCRIPTION_KEY_SECRET must be at least 32 characters');
  const encKey = derive(secret, 'aes-256-gcm');
  const macKey = derive(secret, 'hmac-search');

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encKey, iv);
      const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
    },
    decrypt(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split('.');
      if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error('Unsupported ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
    },
    hash(plain) {
      return createHmac('sha256', macKey).update(normaliseKey(plain)).digest('hex');
    },
  };
}

/** Last 4 visible characters of a key (spaces/dashes ignored), e.g. "4F7A". */
export function keyLast4(plain: string): string {
  return normaliseKey(plain).slice(-4);
}

/** "••••••4F7A" — what every role sees until an ADMIN/FINANCE user taps Show. */
export function maskKey(last4: string): string {
  return `••••••${last4}`;
}
