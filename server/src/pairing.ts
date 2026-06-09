/**
 * pairing.ts — Extension identity pairing and signature verification.
 *
 * AB-5b / AB-6: Implements the signed request model defined in
 * EXTENSION-IDENTITY-BOUNDARY.md.
 *
 * The extension proves client identity via HMAC-SHA256 signature over:
 *   method + path + timestamp + nonce + bodyHash
 *
 * The bridge verifies the signature using the stored client secret.
 * Pairing config is read from a local JSON file alongside the queue.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { PairingConfig, SignedEnvelope } from './types.js';

/** Generate a new pairing config with a random client secret. */
export function generatePairing(clientId?: string): PairingConfig {
  const id = clientId ?? `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const secret = createHmac('sha256', cryptoRandomHex(32)).digest('hex');
  return {
    clientId: id,
    clientSecret: secret,
    pairedAt: new Date().toISOString(),
    label: 'Chrome Extension',
  };
}

/**
 * Create the signature for a request.
 *
 * Signature covers:
 *   method + path + timestamp + nonce + bodyHash
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodyHash?: string,
): string {
  const payload = [method, path, timestamp, nonce, bodyHash ?? ''].join('\n');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a signed request envelope.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export function verifySignature(
  secret: string,
  envelope: SignedEnvelope,
  method: string,
  path: string,
  bodyHash?: string,
): { valid: true } | { valid: false; reason: string } {
  // 1. Check required fields
  if (!envelope.clientId) return { valid: false, reason: 'Missing clientId' };
  if (!envelope.timestamp) return { valid: false, reason: 'Missing timestamp' };
  if (!envelope.nonce) return { valid: false, reason: 'Missing nonce' };
  if (!envelope.signature) return { valid: false, reason: 'Missing signature' };

  // 2. Check timestamp freshness (allow 5 minute skew)
  const ts = new Date(envelope.timestamp).getTime();
  if (isNaN(ts)) return { valid: false, reason: 'Invalid timestamp' };
  const now = Date.now();
  if (Math.abs(now - ts) > 5 * 60 * 1000) {
    return { valid: false, reason: 'Timestamp outside acceptable window (>5 min skew)' };
  }

  // 3. Recompute signature
  const expected = signRequest(secret, method, path, envelope.timestamp, envelope.nonce, bodyHash);

  // 4. Constant-time comparison
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(envelope.signature, 'hex');

  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'Signature length mismatch' };
  }

  if (!timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}

// ── Config persistence ──────────────────────────────────────────────

/**
 * Load the pairing config from a JSON file.
 * Returns null if the file doesn't exist.
 */
export async function loadPairingConfig(configPath: string): Promise<PairingConfig | null> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw) as PairingConfig;
  } catch {
    return null;
  }
}

/**
 * Save a pairing config to a JSON file.
 */
export async function savePairingConfig(configPath: string, config: PairingConfig): Promise<void> {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// ── Helpers ─────────────────────────────────────────────────────────

function cryptoRandomHex(bytes: number): string {
  const buf = Buffer.allocUnsafe(bytes);
  for (let i = 0; i < bytes; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf.toString('hex');
}
