import { describe, expect, it } from 'vitest';
import { decryptExport, encryptExport } from './cryptoExport';

describe('encrypted export', () => {
  it('round-trips data without plaintext in the envelope', async () => {
    const value = { secret: 'private memory' };
    const envelope = await encryptExport(value, 'correct horse battery staple');
    expect(JSON.stringify(envelope)).not.toContain('private memory');
    await expect(decryptExport(envelope, 'correct horse battery staple')).resolves.toEqual(value);
  });

  it('rejects weak passphrases', async () => {
    await expect(encryptExport({}, 'short')).rejects.toThrow('12 characters');
  });

  it('rejects the wrong passphrase', async () => {
    const envelope = await encryptExport({ private: true }, 'correct horse battery staple');
    await expect(decryptExport(envelope, 'incorrect horse battery staple')).rejects.toThrow();
  });

  it.each([
    ['algorithm', 'AES-128-GCM'],
    ['kdf', 'PBKDF2-SHA1'],
    ['iterations', 1],
  ])('rejects an unsupported %s declaration', async (field, value) => {
    const envelope = await encryptExport({ private: true }, 'correct horse battery staple');
    await expect(decryptExport({ ...envelope, [field]: value }, 'correct horse battery staple')).rejects.toThrow('Unsupported export format');
  });

  it('rejects invalid salt and IV sizes before decrypting', async () => {
    const envelope = await encryptExport({ private: true }, 'correct horse battery staple');
    await expect(decryptExport({ ...envelope, salt: 'AA==' }, 'correct horse battery staple')).rejects.toThrow('Invalid export parameters');
    await expect(decryptExport({ ...envelope, iv: 'AA==' }, 'correct horse battery staple')).rejects.toThrow('Invalid export parameters');
  });
});
