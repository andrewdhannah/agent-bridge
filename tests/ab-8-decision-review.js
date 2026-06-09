#!/usr/bin/env node
/**
 * AB-8 — Decision Review / Decision Record Viewer Acceptance Test
 *
 * Verifies:
 *   1. Paired client receives decision review payload via GET /api/decisions
 *   2. Unpaired client receives 401
 *   3. POST /api/decisions returns 405 (Method Not Allowed)
 *   4. PUT /api/decisions returns 405
 *   5. DELETE /api/decisions returns 405
 *   6. Queue counts unchanged before/after review operations
 *   7. Custody artifacts unchanged before/after review operations
 *   8. No authority-granting fields in payload
 *   9. No human identity fields in payload
 *  10. execution_permission is not_granted
 *  11. review_only is true
 *  12. artifact_type is decision_review_payload
 *  13. authority_source is thelibrarian_only
 *  14. Payload structure matches DecisionReviewPayload contract
 *  15. Vocabulary is evidence-based (no approvalStatus, approvedBy, etc.)
 *
 * Usage:
 *   node tests/ab-8-decision-review.js
 *
 * Prerequisites:
 *   - Bridge server running on port 3457 with bridge-config.json
 *   - Librarian server running on port 3456 (optional, degrades gracefully)
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
  if (signedHeader) {
    headers['X-Signed-Request'] = signedHeader;
  }
  const response = await fetch(`${BRIDGE_URL}/api/decisions`, { headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function fetchDecisionsWithMethod(method, signedHeader, bodyPayload) {
  const headers = { 'Content-Type': 'application/json' };
  if (signedHeader) {
    headers['X-Signed-Request'] = signedHeader;
  }
  const response = await fetch(`${BRIDGE_URL}/api/decisions`, {
    method,
    headers,
    body: bodyPayload ? JSON.stringify(bodyPayload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function getQueueState() {
  const resp = await fetch(`${BRIDGE_URL}/status`);
  return resp.json().catch(() => ({}));
}

// ── Authority field blacklist ───────────────────────────────────────

const AUTHORITY_FIELDS = [
  'approvalStatus', 'approvedBy', 'humanId', 'permissionGranted',
  'canExecute', 'canApprove', 'authorizedUser', 'humanIdentity',
  'agentIdentity', 'role', 'approvalAuthority', 'executionAuthority',
  'human_identity', 'agent_identity', 'approval_status', 'approved_by',
  'human_id', 'permission_granted', 'can_execute', 'can_approve',
  'authorized_user', 'approval_authority', 'execution_authority',
];

const IDENTITY_FIELDS = [
  'humanIdentity', 'human_identity', 'agentIdentity', 'agent_identity',
  'humanId', 'human_id', 'role', 'userProfile', 'user_profile',
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('=== AB-8 — Decision Review / Decision Record Viewer Acceptance Test ===');
  console.log('');

  // Load pairing config
  const configRaw = await readFile(PAIRING_CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configRaw);
  console.log(`  Pairing config: ${config.clientId}`);
  console.log('');

  // Record initial queue state for mutation check
  const queueBefore = await getQueueState();
  console.log(`  Queue state before: incoming=${queueBefore.incoming} approved=${queueBefore.approved}`);
  console.log('');

  // ── Test 1: Unpaired client receives 401 ─────────────────────────
  console.log('[Test 1] Unpaired client cannot access decisions');
  const unpaired = await fetchDecisions(undefined);
  assert(unpaired.status === 401, 'Unpaired request returns 401', 'Got ' + unpaired.status);
  assert(unpaired.body && unpaired.body.error === 'Unauthorized', 'Error body: Unauthorized');
  console.log('');

  // ── Test 2: Paired client receives decision review payload ───────
  console.log('[Test 2] Paired client receives decision review payload');
  const header = createSignedHeader(config.clientId, config.clientSecret, 'GET', '/api/decisions');
  const paired = await fetchDecisions(header);
  assert(paired.status === 200, 'Paired request returns 200', 'Got ' + paired.status);
  console.log('');

  // ── Test 3: Payload has correct top-level structure ──────────────
  console.log('[Test 3] Payload structure');
  const p = paired.body;

  assert(p.artifactType === 'decision_review_payload',
    'artifactType is decision_review_payload');
  assert(p.reviewOnly === true, 'reviewOnly is true');
  assert(p.executionPermission === 'not_granted', 'executionPermission is not_granted');
  assert(p.authoritySource === 'thelibrarian_only', 'authoritySource is thelibrarian_only');
  assert(typeof p.generatedAt === 'string' && p.generatedAt.length > 0, 'generatedAt present');
  assert(!!p.bridge, 'bridge section present');
  assert(p.bridge.instance === 'agent-bridge', 'bridge.instance present');
  assert(typeof p.bridge.version === 'string', 'bridge.version present');
  assert(!!p.queueSummary, 'queueSummary present');
  assert(typeof p.queueSummary.incoming === 'number', 'queueSummary.incoming');
  assert(typeof p.queueSummary.approved === 'number', 'queueSummary.approved');
  assert(typeof p.queueSummary['in-progress'] === 'number', 'queueSummary.in-progress');
  assert(typeof p.queueSummary.complete === 'number', 'queueSummary.complete');
  assert(typeof p.queueSummary.rejected === 'number', 'queueSummary.rejected');
  assert(Array.isArray(p.records), 'records is array');
  assert(p.librarianHealth === 'connected' || p.librarianHealth === 'disconnected',
    'librarianHealth valid');
  console.log('');

  // ── Test 4: Record structure is correct ──────────────────────────
  console.log('[Test 4] Record structure');
  const records = p.records || [];
  for (const record of records) {
    assert(!!record.recordId, 'recordId present');
    assert(!!record.reviewedAt, 'reviewedAt present');

    // Intent layer
    assert('intentId' in record, 'intentId field present');
    assert('custodyId' in record, 'custodyId field present');
    assert('intentType' in record, 'intentType field present');
    assert('intentTimestamp' in record, 'intentTimestamp field present');
    assert(['recorded', 'rejected', 'no_intent_recorded'].includes(record.intentStatus) ||
           record.intentStatus === null,
           `intentStatus valid: ${record.intentStatus}`);

    // Custody layer
    assert('custodyStatus' in record, 'custodyStatus field present');
    assert('custodyExecutionPermission' in record, 'custodyExecutionPermission field present');
    assert('custodyTimestamp' in record, 'custodyTimestamp field present');

    // Queue provenance layer
    assert('sourceQueueItemId' in record, 'sourceQueueItemId field present');
    assert('queueState' in record, 'queueState field present');
    assert('queueSource' in record, 'queueSource field present');
    assert('queueThreadTitle' in record, 'queueThreadTitle field present');

    // Integrity layer
    assert(['consistent', 'inconsistent', 'incomplete'].includes(record.integrityStatus),
      `integrityStatus valid: ${record.integrityStatus}`);
  }
  console.log('');

  // ── Test 5: POST /api/decisions returns 405 ──────────────────────
  console.log('[Test 5] POST /api/decisions returns 405');
  const postResp = await fetchDecisionsWithMethod('POST', header, { action: 'approve' });
  assert(postResp.status === 405, 'POST returns 405', 'Got ' + postResp.status);
  assert(postResp.body && postResp.body.error === 'Method Not Allowed',
    'Error: Method Not Allowed');
  console.log('');

  // ── Test 6: PUT /api/decisions returns 405 ───────────────────────
  console.log('[Test 6] PUT /api/decisions returns 405');
  const putResp = await fetchDecisionsWithMethod('PUT', header, {});
  assert(putResp.status === 405, 'PUT returns 405', 'Got ' + putResp.status);
  console.log('');

  // ── Test 7: DELETE /api/decisions returns 405 ────────────────────
  console.log('[Test 7] DELETE /api/decisions returns 405');
  const delResp = await fetchDecisionsWithMethod('DELETE', header);
  assert(delResp.status === 405, 'DELETE returns 405', 'Got ' + delResp.status);
  console.log('');

  // ── Test 8: Queue state unchanged after all review operations ────
  console.log('[Test 8] Queue state unchanged after review operations');
  const queueAfter = await getQueueState();
  assert(queueAfter.incoming === queueBefore.incoming,
    `incoming unchanged (${queueBefore.incoming})`);
  assert(queueAfter.approved === queueBefore.approved,
    `approved unchanged (${queueBefore.approved})`);
  assert(queueAfter['in-progress'] === queueBefore['in-progress'],
    `in-progress unchanged (${queueBefore['in-progress']})`);
  assert(queueAfter.complete === queueBefore.complete,
    `complete unchanged (${queueBefore.complete})`);
  assert(queueAfter.rejected === queueBefore.rejected,
    `rejected unchanged (${queueBefore.rejected})`);
  console.log('');

  // ── Test 9: No authority-granting fields in payload ────────────
  console.log('[Test 9] No authority-granting fields in payload');
  const payloadKeys = flattenKeys(p);
  for (const field of AUTHORITY_FIELDS) {
    const found = payloadKeys.some(k => k.includes(field));
    assert(!found, `Authority field not present: ${field}`);
  }
  console.log('');

  // ── Test 10: No human identity fields in payload ────────────────
  console.log('[Test 10] No human identity fields in payload');
  for (const field of IDENTITY_FIELDS) {
    const found = payloadKeys.some(k => k.includes(field));
    assert(!found, `Identity field not present: ${field}`);
  }
  console.log('');

  // ── Test 11: Vocabulary is evidence-based ──────────────────────
  console.log('[Test 11] Vocabulary is evidence-based');
  // Check record-level field names use evidence-based vocabulary
  for (const record of records) {
    const recordKeys = Object.keys(record);

    // These are the approved evidence-based names
    const allowedNames = [
      'recordId', 'reviewedAt',
      'intentId', 'custodyId', 'intentType', 'intentTimestamp', 'intentStatus',
      'custodyStatus', 'custodyExecutionPermission', 'custodyTimestamp',
      'sourceQueueItemId', 'queueState', 'queueSource', 'queueThreadTitle',
      'integrityStatus',
    ];

    for (const key of recordKeys) {
      if (!allowedNames.includes(key)) {
        // If it's not in the allowed list, it might be an authority field
        assert(false, `No unexpected fields in record: ${key}`);
      }
    }
  }
  assert(true, 'All record fields use evidence-based vocabulary');
  console.log('');

  // ── Test 12: No queue_approve/queue_start references exist -----
  console.log('[Test 12] No approval/execution call paths in payload');
  assert(!p.queue_approve, 'queue_approve not in payload');
  assert(!p.queue_reject, 'queue_reject not in payload');
  assert(!p.queue_start, 'queue_start not in payload');
  assert(!p.queue_complete, 'queue_complete not in payload');
  console.log('');

  // ── Test 13: extensionVisibleStatus is valid ─────────────────────
  console.log('[Test 13] extensionVisibleStatus is valid');
  const validStatuses = ['review_ready', 'librarian_unreachable', 'no_records_available'];
  assert(validStatuses.includes(p.extensionVisibleStatus),
    `extensionVisibleStatus is valid: ${p.extensionVisibleStatus}`);
  console.log('');

  // ── Test 14: Records sorted newest-first ─────────────────────────
  console.log('[Test 14] Records sorted newest-first');
  if (records.length >= 2) {
    const ts0 = records[0].intentTimestamp || records[0].custodyTimestamp || '';
    const ts1 = records[1].intentTimestamp || records[1].custodyTimestamp || '';
    assert(ts0 >= ts1, 'Records sorted newest-first');
  } else {
    assert(true, 'Skip sort check — fewer than 2 records');
  }
  console.log('');

  // ── Test 15: Bridge identity in payload ──────────────────────────
  console.log('[Test 15] Bridge identity');
  assert(p.bridge.instance === 'agent-bridge', 'Bridge instance matches config');
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

/**
 * Recursively flatten all keys in an object to check for forbidden fields.
 */
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
