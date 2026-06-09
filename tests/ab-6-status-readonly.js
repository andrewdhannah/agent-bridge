#!/usr/bin/env node
/**
 * AB-6 — Extension Status Reflection Acceptance Test
 *
 * Verifies:
 *   1. Paired extension receives read-only aggregated status
 *   2. Unpaired client receives 401
 *   3. Status payload contains all required fields
 *   4. No write operations are exposed through the status endpoint
 *   5. The Librarian health indicator functions
 *
 * Usage:
 *   node tests/ab-6-status-readonly.js
 *
 * Prerequisites:
 *   - Bridge server running on port 3457 with bridge-config.json
 *   - Librarian server running on port 3456 (optional, status degrades gracefully)
 */

import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:3457';
const PAIRING_CONFIG_PATH = resolve(import.meta.dirname ?? '.', '..', 'server', 'bridge-config.json');

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    const msg = detail ? `${label} -- ${detail}` : label;
    errors.push(msg);
    console.log(`  [FAIL] ${msg}`);
  }
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function createSignedHeader(clientId, secret, method, path) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const payload = [method, path, timestamp, nonce, ''].join('\n');
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return JSON.stringify({ clientId, timestamp, nonce, signature });
}

async function fetchStatus(signedHeader) {
  const headers = { 'Content-Type': 'application/json' };
  if (signedHeader) {
    headers['X-Signed-Request'] = signedHeader;
  }
  const response = await fetch(`${BRIDGE_URL}/api/status`, { headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('=== AB-6 - Extension Status Reflection Acceptance Test ===');
  console.log('');

  // Load pairing config
  const configRaw = await readFile(PAIRING_CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configRaw);
  console.log(`  Pairing config: ${config.clientId}`);
  console.log('');

  // -- Test 1: Unpaired client receives 401 -----------------------------
  console.log('[Test 1] Unpaired client cannot access status');
  const unpaired = await fetchStatus(undefined);
  assert(unpaired.status === 401, 'Unpaired request returns 401', 'Got ' + unpaired.status);
  assert(unpaired.body && unpaired.body.error === 'Unauthorized', 'Error body: Unauthorized');
  console.log('');

  // -- Test 2: Paired client receives 200 --------------------------------
  console.log('[Test 2] Paired client receives aggregated status');
  const header = createSignedHeader(config.clientId, config.clientSecret, 'GET', '/api/status');
  const paired = await fetchStatus(header);
  assert(paired.status === 200, 'Paired request returns 200', 'Got ' + paired.status);
  console.log('');

  // -- Test 3: Status payload has required fields ------------------------
  console.log('[Test 3] Status payload structure');
  const s = paired.body;

  assert(!!s.generatedAt, 'generatedAt present');
  assert(!!s.bridge, 'bridge section present');
  assert(s.bridge.instance === 'agent-bridge', 'bridge.instance present');
  assert(typeof s.bridge.uptime === 'number', 'bridge.uptime is number');

  assert(!!s.queue, 'queue section present');
  assert(typeof s.queue.incoming === 'number', 'queue.incoming count');
  assert(typeof s.queue.approved === 'number', 'queue.approved count');
  assert(typeof s.queue['in-progress'] === 'number', 'queue.in-progress count');
  assert(typeof s.queue.complete === 'number', 'queue.complete count');
  assert(typeof s.queue.rejected === 'number', 'queue.rejected count');

  assert(!!s.queueItems, 'queueItems section present');
  assert(Array.isArray(s.queueItems.incoming), 'queueItems.incoming is array');
  assert(Array.isArray(s.queueItems.approved), 'queueItems.approved is array');
  assert(Array.isArray(s.queueItems['in-progress']), 'queueItems.in-progress is array');
  assert(Array.isArray(s.queueItems.complete), 'queueItems.complete is array');
  assert(Array.isArray(s.queueItems.rejected), 'queueItems.rejected is array');

  assert(s.custody === null || (typeof s.custody === 'object'), 'custody is object or null');

  assert(s.librarianHealth === 'connected' || s.librarianHealth === 'disconnected',
    'librarianHealth valid');
  console.log('');

  // -- Test 4: Queue item summaries have correct shape -------------------
  console.log('[Test 4] Queue item summaries shape');
  const incomingItems = s.queueItems.incoming || [];
  for (const item of incomingItems) {
    assert(!!item.packetId, 'Item ' + item.packetId + ': packetId present');
    assert(!!item.source, 'Item ' + item.packetId + ': source present');
    assert(!!item.state, 'Item ' + item.packetId + ': state present');
    assert(typeof item.requiresHumanApproval === 'boolean',
      'Item ' + item.packetId + ': requiresHumanApproval boolean');
    assert(typeof item.hasResult === 'boolean',
      'Item ' + item.packetId + ': hasResult boolean');
  }
  console.log('');

  // -- Test 5: Expired signature receives 401 ----------------------------
  console.log('[Test 5] Expired/replayed signature rejected');
  const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const oldNonce = randomUUID();
  const oldPayload = ['GET', '/api/status', oldTimestamp, oldNonce, ''].join('\n');
  const oldSig = createHmac('sha256', config.clientSecret).update(oldPayload).digest('hex');
  const oldHeader = JSON.stringify({
    clientId: config.clientId,
    timestamp: oldTimestamp,
    nonce: oldNonce,
    signature: oldSig,
  });
  const expired = await fetchStatus(oldHeader);
  assert(expired.status === 401, 'Expired signature returns 401', 'Got ' + expired.status);
  assert(
    expired.body && expired.body.detail && expired.body.detail.includes('Timestamp outside acceptable window'),
    'Error indicates timestamp skew',
  );
  console.log('');

  // -- Test 6: No write paths through status endpoint --------------------
  console.log('[Test 6] No write paths through status endpoint');
  assert(s.queue.incoming <= 10, 'Queue counts are reasonable (read-only)');
  const postResponse = await fetch(`${BRIDGE_URL}/api/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signed-Request': header },
    body: JSON.stringify({ action: 'approve', packetId: 'test' }),
  });
  assert(postResponse.status === 404, 'POST to /api/status returns 404', 'Got ' + postResponse.status);
  console.log('');

  // -- Summary -----------------------------------------------------------
  console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  console.log('');

  if (failed > 0) {
    console.error('Failures:');
    for (const e of errors) {
      console.error('  - ' + e);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Test harness error: ' + err.message);
  process.exit(1);
});
