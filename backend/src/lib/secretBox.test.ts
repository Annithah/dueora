import { describe, expect, it } from 'vitest';

import { createSecretBox, keyLast4, maskKey, normaliseKey } from './secretBox.js';

const box = createSecretBox('s'.repeat(40));

describe('secretBox', () => {
  it('round-trips a key and never stores the plaintext', () => {
    const sealed = box.encrypt('LIC-9F3A-22B1-4F7A');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('9F3A');
    expect(box.decrypt(sealed)).toBe('LIC-9F3A-22B1-4F7A');
  });

  it('uses a fresh IV every time', () => {
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('rejects tampered ciphertext and foreign secrets', () => {
    const sealed = box.encrypt('ACC-12345');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
    expect(() => createSecretBox('o'.repeat(40)).decrypt(sealed)).toThrow();
    expect(() => box.decrypt('garbage')).toThrow(/Unsupported/);
  });

  it('hashes keys for exact search, ignoring case, spaces and dashes', () => {
    expect(box.hash('lic 9f3a-22b1')).toBe(box.hash('LIC9F3A22B1'));
    expect(box.hash('LIC9F3A22B1')).not.toBe(box.hash('LIC9F3A22B2'));
    expect(createSecretBox('o'.repeat(40)).hash('LIC9F3A22B1')).not.toBe(box.hash('LIC9F3A22B1'));
  });

  it('masks keys to the last 4 characters', () => {
    expect(normaliseKey(' ab-cd ef ')).toBe('ABCDEF');
    expect(keyLast4('LIC-9F3A-22B1-4f7a')).toBe('4F7A');
    expect(maskKey('4F7A')).toBe('••••••4F7A');
  });

  it('requires a long secret', () => {
    expect(() => createSecretBox('short')).toThrow(/32 characters/);
  });
});
