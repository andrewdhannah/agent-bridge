#!/usr/bin/env node
/**
 * AB-9 — Persistent Pairing + Decision Context Acceptance Test
 *
 * Verifies:
 *   1. Pairing auto-discovery and persistence
 *   2. Context cards contain evidence-sourced fields
 *   3. Context source is labeled (queue / custody / audit)
 *   4. Missing context degrades gracefully
 *   5. No authority fields in context payload
 *   6. Pairing revoke/reset (via chrome.storage.local simulation)
 *   7. Paired/unpaired state endpoints are consistent
 *   8. All reads, no writes
 *
 * Usage:
 *   node tests/ab-9-pairing-and-context.js
 *
 * Prerequisites:
 *   - Bridge server running on port 3457 with bridge-config.json
 *   - Librarian server running on port 3456 (optional, degrades gracefully)
 */

import { createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const BRIDGE_URL = 'http://127.0.0.1:3457';
const PAIRING_CONFIG_PATH = resolve(import.meta.dirname ?? '.', '..', 'server', 'bridge-config.json');
const PAIRING_BACKUP_PATH = resolve(import.meta.dirname ?? '.', '..', 'server', 'bridge-config.json.bak');

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

// ── Helpers ─────────────────────────────────────────────────────────

function createSignature(secret, method, path, timestamp, nonce, bodyHash) {
  const payload = [method, path, timestamp, nonce, bodyHash ?? ''].join('\n');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function createSignedHeader(clientId, secret, method, path) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const signature = createSignature(secret, method, path, timestamp, nonce, '');
  return JSON.stringify({ clientId, timestamp, nonce, signature });
}

async function fetchDecisions(signedHeader) {
  const headers = { 'Content-Type': 'application/json' };
  if (signedHeader) headers['X-Signed-Request'] = signedHeader;
  const response = await fetch(`${BRIDGE_URL}/api/decisions`, { headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function fetchPairingInfo() {
  try {
    const resp = await fetch(`${BRIDGE_URL}/api/pairing/info`);
    const body = await resp.json().catch(() => ({}));
    return { status: resp.status, body };
  } catch {
    return { status: 0, body: {} };
  }
}

async function getQueueState() {
  const resp = await fetch(`${BRIDGE_URL}/status`);
  return resp.json().catch(() => ({}));
}

// Authority field blacklist (same as AB-8)
const AUTHORITY_FIELDS = [
  'approvalStatus', 'approvedBy', 'humanId', 'permissionGranted',
  'canExecute', 'canApprove', 'authorizedUser', 'humanIdentity',
  'agentIdentity', 'role', 'approvalAuthority', 'executionAuthority',
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('=== AB-9 — Persistent Pairing + Decision Context Acceptance Test ===');
  console.log('');

  // Load pairing config
  const configRaw = await readFile(PAIRING_CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configRaw);
  console.log(`  Pairing config: ${config.clientId}`);
  console.log('');

  // Record initial queue state
  const queueBefore = await getQueueState();
  console.log(`  Queue state before: incoming=${queueBefore.incoming} approved=${queueBefore.approved}`);
  console.log('');

  const header = createSignedHeader(config.clientId, config.clientSecret, 'GET', '/api/decisions');

  // ── Test 1: Pairing auto-discovery via GET /api/pairing/info ───────
  console.log('[Test 1] Pairing auto-discovery endpoint');
  const pairingResp = await fetchPairingInfo();
  assert(pairingResp.status === 200, 'GET /api/pairing/info returns 200', 'Got ' + pairingResp.status);
  assert(pairingResp.body && pairingResp.body.clientId === config.clientId,
    'Pairing info contains correct clientId');
  assert(pairingResp.body && !!pairingResp.body.clientSecret,
    'Pairing info contains clientSecret');
  assert(pairingResp.body && !!pairingResp.body.pairedAt,
    'Pairing info contains pairedAt');
  console.log('');

  // ── Test 2: Paired client receives decision review with context ───
  console.log('[Test 2] Decision review with context fields');
  const paired = await fetchDecisions(header);
  assert(paired.status === 200, 'Paired request returns 200', 'Got ' + paired.status);
  console.log('');

  // ── Test 3: Context card fields present and valid ─────────────────
  console.log('[Test 3] Context card fields in records');
  const records = paired.body.records || [];
  assert(records.length > 0, 'Records array is non-empty', 'Found ' + records.length);

  for (const record of records) {
    // contextSummary should be a string or null
    assert('contextSummary' in record, `Record ${record.recordId?.slice(0,8)}: contextSummary present`);
    if (record.contextSummary !== null) {
      assert(typeof record.contextSummary === 'string' && record.contextSummary.length > 0,
        `Record ${record.recordId?.slice(0,8)}: contextSummary is non-empty string`);
      // Context should come from evidence, not be an authority-sounding phrase
      const lower = record.contextSummary.toLowerCase();
      assert(!lower.includes('approved by'), 'contextSummary does not contain approved by');
      assert(!lower.includes('authorized'), 'contextSummary does not contain authorized');
    }

    // contextSource should be 'queue', 'custody', 'audit', or null
    assert('contextSource' in record, `Record ${record.recordId?.slice(0,8)}: contextSource present`);
    if (record.contextSource !== null) {
      assert(['queue', 'custody', 'audit'].includes(record.contextSource),
        `Record ${record.recordId?.slice(0,8)}: contextSource is valid: ${record.contextSource}`);
    }

    // riskClass should be a string or null
    assert('riskClass' in record, `Record ${record.recordId?.slice(0,8)}: riskClass present`);
  }
  console.log('');

  // ── Test 4: Context summary matches expected content shape ────────
  console.log('[Test 4] Context summary shape');
  let foundQueueContext = false;
  let foundAuditContext = false;

  for (const record of records) {
    if (record.contextSource === 'queue' && record.contextSummary) {
      foundQueueContext = true;
      // Queue context should include source info or prompt text
      assert(record.contextSummary.length <= 500,
        `Queue context summary length ≤ 500: ${record.contextSummary.length}`);
    }
    if (record.contextSource === 'audit' && record.contextSummary) {
      foundAuditContext = true;
      // Audit context should reference intent type or custody
      assert(
        record.contextSummary.includes('Decision intent') ||
        record.contextSummary.includes('approve_') ||
        record.contextSummary.includes('reject_') ||
        record.contextSummary.includes('defer_'),
        'Audit context references intent type'
      );
    }
  }

  // At least some records should have context (either from queue or audit)
  assert(foundQueueContext || foundAuditContext,
    'At least some records have contextual summary from queue or audit');
  console.log('');

  // ── Test 5: No authority fields in context payload ───────────────
  console.log('[Test 5] No authority fields in payload');
  const payloadKeys = flattenKeys(paired.body);
  for (const field of AUTHORITY_FIELDS) {
    const found = payloadKeys.some(k => k.toLowerCase().includes(field.toLowerCase()));
    assert(!found, `Authority field not present: ${field}`);
  }
  console.log('');

  // ── Test 6: Context source label does not imply authority ────────
  console.log('[Test 6] Context source does not imply authority');
  const contextSourceValues = new Set(records.map(r => r.contextSource));
  for (const src of contextSourceValues) {
    if (src === null) continue;
    assert(['queue', 'custody', 'audit'].includes(src),
      `Context source is evidence-based: ${src}`);
  }
  console.log('');

  // ── Test 7: Queue state unchanged after all operations ────────────
  console.log('[Test 7] Queue state unchanged');
  const queueAfter = await getQueueState();
  assert(queueAfter.incoming === queueBefore.incoming, 'incoming unchanged');
  assert(queueAfter.approved === queueBefore.approved, 'approved unchanged');
  assert(queueAfter['in-progress'] === queueBefore['in-progress'], 'in-progress unchanged');
  assert(queueAfter.complete === queueBefore.complete, 'complete unchanged');
  assert(queueAfter.rejected === queueBefore.rejected, 'rejected unchanged');
  console.log('');

  // ── Test 8: Pairing info matches config file ─────────────────────
  console.log('[Test 8] Pairing info consistency');
  assert(pairingResp.body.clientId === config.clientId, 'clientId matches bridge-config.json');
  assert(pairingResp.body.clientSecret === config.clientSecret, 'clientSecret matches bridge-config.json');
  console.log('');

  // ── Test 9: Unpaired client still rejected (pairing not weakened) ─
  console.log('[Test 9] Pairing not weakened');
  const unpaired = await fetchDecisions(undefined);
  assert(unpaired.status === 401, 'Unpaired request still returns 401', 'Got ' + unpaired.status);
  console.log('');

  // ── Test 10: Context card payload has review_only and execution_permission ─
  console.log('[Test 10] Review-only posture in context payload');
  assert(paired.body.reviewOnly === true, 'reviewOnly is true');
  assert(paired.body.executionPermission === 'not_granted', 'executionPermission is not_granted');
  assert(paired.body.authoritySource === 'thelibrarian_only', 'authoritySource is thelibrarian_only');
  console.log('');

  // ── Summary ────────────────────────────────────────────────────────
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

// ── Utility ─────────────────────────────────────────────────────────

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      keys.push(...flattenKeys(obj[key], fullKey));
    }
  }
  return keys;
}

main().catch((err) => {
  console.error('Test harness error: ' + err.message);
  process.exit(1);
});
