const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export interface EncryptedEnvelope {
  format: 'companion-studio-encrypted'; version: 1; algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256'; iterations: 310000; salt: string; iv: string; ciphertext: string;
}

export async function encryptExport(value: unknown, passphrase: string): Promise<EncryptedEnvelope> {
  if (passphrase.length < 12) throw new Error('Passphrase must contain at least 12 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return { format: 'companion-studio-encrypted', version: 1, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: 310000, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptExport<T>(envelope: EncryptedEnvelope, passphrase: string): Promise<T> {
  if (
    envelope.format !== 'companion-studio-encrypted' || envelope.version !== 1 ||
    envelope.algorithm !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA256' ||
    envelope.iterations !== 310_000
  ) throw new Error('Unsupported export format');
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid export parameters');
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    base64ToBytes(envelope.ciphertext) as BufferSource,
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
