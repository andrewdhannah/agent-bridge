#!/usr/bin/env node
/**
 * AB-7 — Browser Decision Intent Surface Acceptance Test
 *
 * Verifies:
 *   1. Paired extension can submit a valid decision intent
 *   2. Unpaired client receives 401
 *   3. Invalid intents are rejected
 *   4. Duplicate nonces are rejected
 *   5. Response never includes human identity
 *   6. Bridge queue state is unchanged after intent submission
 *   7. No approval/execution tools called
 *
 * Usage:
 *   node tests/ab-7-decision-intent.js
 *
 * Prerequisites:
 *   - Bridge server running on port 3457 with bridge-config.json
 *   - Librarian server running on port 3456
 */

import { createHmac, createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BRIDGE_URL = 'http://127.0.0.1:3457';
const PAIRING_CONFIG_PATH = resolve(import.meta.dirname ?? '.', '..', 'server', 'bridge-config.json');
const QUEUE_INCOMING_DIR = resolve(import.meta.dirname ?? '.', '..', 'server', 'queue', 'incoming');

const VALID_INTENTS = ['approve_requested', 'reject_requested', 'defer_requested'];

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

function createSignature(secret, method, path, timestamp, nonce, bodyHash) {
  const payload = [method, path, timestamp, nonce, bodyHash ?? ''].join('\n');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function buildSignedIntent(secret, clientId, overrides = {}) {
  const timestamp = overrides.timestamp ?? new Date().toISOString();
  const nonce = overrides.nonce ?? randomUUID();
  const body = {
    custodyId: overrides.custodyId ?? 'CUST-AB7-0001',
    decisionIntent: overrides.decisionIntent ?? 'approve_requested',
    clientId,
    timestamp,
    nonce,
  };
  const bodyHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const signature = createSignature(secret, 'POST', '/api/decision-intent', timestamp, nonce, bodyHash);
  return { ...body, bodyHash, signature };
}

async function postIntent(intentBody) {
  const response = await fetch(`${BRIDGE_URL}/api/decision-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intentBody),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function getQueueState() {
  const resp = await fetch(`${BRIDGE_URL}/status`);
  return resp.json().catch(() => ({}));
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('=== AB-7 - Browser Decision Intent Surface Acceptance Test ===');
  console.log('');

  // Load pairing config
  const configRaw = await readFile(PAIRING_CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configRaw);
  console.log(`  Pairing config: ${config.clientId}`);
  console.log('');

  // Record initial queue state for comparison
  const queueBefore = await getQueueState();
  console.log(`  Queue state before: incoming=${queueBefore.incoming} approved=${queueBefore.approved}`);
  console.log('');

  // -- Test 1: Valid decision intent accepted ----------------------------
  console.log('[Test 1] Valid decision intent is accepted');
  const intent1 = buildSignedIntent(config.clientSecret, config.clientId, {
    decisionIntent: 'approve_requested',
  });
  const validResp = await postIntent(intent1);
  assert(validResp.status === 200, 'Valid intent returns 200', 'Got ' + validResp.status);
  assert(validResp.body.accepted === true, 'accepted is true');
  assert(validResp.body.extensionVisibleStatus === 'decision_intent_recorded',
    'status is decision_intent_recorded');
  assert(validResp.body.executionPermission === 'not_granted',
    'executionPermission is not_granted');
  assert(validResp.body.nextRequiredAction === 'librarian_validation',
    'nextRequiredAction is librarian_validation');
  console.log('');

  // -- Test 2: Unpaired client receives 401 -----------------------------
  console.log('[Test 2] Unpaired client receives 401');
  // Build with valid structure but wrong secret (simulates unknown client)
  const wrongSecret = '0000000000000000000000000000000000000000000000000000000000000000';
  const unpairedIntent = buildSignedIntent(wrongSecret, 'unknown-client', {
    decisionIntent: 'approve_requested',
  });
  const unpairedResp = await postIntent(unpairedIntent);
  assert(unpairedResp.status === 401, 'Unpaired request returns 401', 'Got ' + unpairedResp.status);
  assert(unpairedResp.body.extensionVisibleStatus === 'unauthorized',
    'status is unauthorized');
  console.log('');

  // -- Test 3: Invalid intent value rejected ----------------------------
  console.log('[Test 3] Invalid intent value rejected');
  const intent3 = buildSignedIntent(config.clientSecret, config.clientId, {
    decisionIntent: 'execute_now',
  });
  const invalidResp = await postIntent(intent3);
  assert(invalidResp.status === 400, 'Invalid intent returns 400', 'Got ' + invalidResp.status);
  assert(invalidResp.body.extensionVisibleStatus === 'invalid_intent',
    'status is invalid_intent');
  console.log('');

  // -- Test 4: All valid intent types accepted ---------------------------
  console.log('[Test 4] All valid intent types accepted');
  for (const intentType of VALID_INTENTS) {
    const intent = buildSignedIntent(config.clientSecret, config.clientId, {
      decisionIntent: intentType,
      nonce: randomUUID(),
      timestamp: new Date().toISOString(),
    });
    const resp = await postIntent(intent);
    assert(resp.status === 200, `${intentType} returns 200`, 'Got ' + resp.status);
    assert(resp.body.accepted === true, `${intentType}: accepted is true`);
  }
  console.log('');

  // -- Test 5: Duplicate nonce rejected ---------------------------------
  console.log('[Test 5] Duplicate nonce rejected');
  const sharedNonce = randomUUID();
  const intent5a = buildSignedIntent(config.clientSecret, config.clientId, {
    nonce: sharedNonce,
    timestamp: new Date().toISOString(),
  });
  const firstUse = await postIntent(intent5a);
  assert(firstUse.status === 200, 'First use of nonce accepted');

  // Reuse the same nonce
  const intent5b = buildSignedIntent(config.clientSecret, config.clientId, {
    nonce: sharedNonce,
    timestamp: new Date().toISOString(),
  });
  const replay = await postIntent(intent5b);
  assert(replay.status === 409, 'Duplicate nonce returns 409', 'Got ' + replay.status);
  assert(replay.body.extensionVisibleStatus === 'duplicate_intent',
    'status is duplicate_intent');
  console.log('');

  // -- Test 6: Expired timestamp rejected --------------------------------
  console.log('[Test 6] Expired timestamp rejected');
  const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const intent6 = buildSignedIntent(config.clientSecret, config.clientId, {
    timestamp: oldTime,
    nonce: randomUUID(),
  });
  const expiredResp = await postIntent(intent6);
  assert(expiredResp.status === 401, 'Expired returns 401', 'Got ' + expiredResp.status);
  assert(expiredResp.body.extensionVisibleStatus === 'unauthorized',
    'status is unauthorized');
  console.log('');

  // -- Test 7: Response never contains human identity --------------------
  console.log('[Test 7] No human identity in response');
  const intent7 = buildSignedIntent(config.clientSecret, config.clientId, {
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
  });
  const resp7 = await postIntent(intent7);
  const bodyKeys = Object.keys(resp7.body);
  assert(!bodyKeys.includes('human_identity'), 'human_identity not in response');
  assert(!bodyKeys.includes('agent_identity'), 'agent_identity not in response');
  assert(!bodyKeys.includes('role'), 'role not in response');
  assert(!bodyKeys.includes('humanIdentity'), 'humanIdentity not in response');
  console.log('');

  // -- Test 8: Bridge queue unchanged after intents ----------------------
  console.log('[Test 8] Bridge queue state unchanged');
  const queueAfter = await getQueueState();
  assert(queueAfter.incoming === queueBefore.incoming, `incoming unchanged (${queueBefore.incoming})`);
  assert(queueAfter.approved === queueBefore.approved, `approved unchanged (${queueBefore.approved})`);
  assert(queueAfter['in-progress'] === queueBefore['in-progress'],
    `in-progress unchanged (${queueBefore['in-progress']})`);
  assert(queueAfter.complete === queueBefore.complete, `complete unchanged (${queueBefore.complete})`);
  assert(queueAfter.rejected === queueBefore.rejected, `rejected unchanged (${queueBefore.rejected})`);
  console.log('');

  // -- Test 9: Missing fields rejected -----------------------------------
  console.log('[Test 9] Missing fields rejected');
  const missingResp = await postIntent({ clientId: config.clientId });
  assert(missingResp.status === 400, 'Missing fields returns 400', 'Got ' + missingResp.status);
  assert(missingResp.body.extensionVisibleStatus === 'missing_fields',
    'status is missing_fields');
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
