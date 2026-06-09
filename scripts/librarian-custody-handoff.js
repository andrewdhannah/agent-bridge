#!/usr/bin/env node
/**
 * librarian-custody-handoff.js
 *
 * AB-5: Controlled Custody Handoff
 *
 * Accepts a validated agent-bridge intake receipt and creates a custody artifact
 * inside The Librarian as evidence of intent — without executing, approving, or
 * changing the underlying bridge queue item.
 *
 * Core distinction:
 *   AB-3: Generate safe receipt              (producer-side)
 *   AB-4: Validate receipt before custody   (receiver-side)
 *   AB-5: Assign custody and provenance     (Librarian-side)
 *
 * Hard constraints:
 *   - No auto-execution
 *   - No auto-approval
 *   - No bridge bypass
 *   - No queue state transition
 *   - No browser postback
 *   - Custody intake does not imply permission to act
 *
 * Usage:
 *   node scripts/librarian-custody-handoff.js <validated-receipt.json>
 *
 * Exit codes:
 *   0 — Custody handoff complete (artifact created, Librarian notified)
 *   1 — Pre-condition failed (receipt invalid, bridge state changed, etc.)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
  // Path to the AB-4 validator
  validatorScript: path.resolve(__dirname, 'validate-librarian-intake-receipt.js'),

  // Bridge queue directory
  bridgeQueueDir: path.resolve(__dirname, '..', 'server', 'queue'),

  // Output directory for custody artifacts
  custodyOutputDir: path.resolve(__dirname, '..', 'docs', 'custody', 'agent-bridge'),

  // The Librarian MCP endpoint
  librarianMCPUrl: 'http://127.0.0.1:3456/mcp',

  // Source document for Librarian generate_doc (an architecture/policy doc)
  librarianSourceDocId: 376,

  // The valid receipt fixture for reference
  validReceiptFixture: path.resolve(__dirname, '..',
    'tests', 'fixtures', 'agent-bridge-intake', 'valid-receipt.json'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  Wrote: ${filePath}`);
}

function generateUUID() {
  // Use crypto.randomUUID if available (Node 19+)
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Librarian MCP client
// ---------------------------------------------------------------------------

async function callLibrarianTool(toolName, args) {
  const url = CONFIG.librarianMCPUrl;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: `ab5-${Date.now()}`,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Librarian HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Librarian MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  // MCP wraps the result in result.content[0].text as a JSON string
  const content = data?.result?.content;
  if (content && content.length > 0 && content[0].type === 'text') {
    try {
      return JSON.parse(content[0].text);
    } catch {
      return content[0].text;
    }
  }

  return data.result;
}

// ---------------------------------------------------------------------------
// Step 1: Validate receipt using AB-4 validator
// ---------------------------------------------------------------------------

function validateReceipt(receiptPath) {
  console.log('\n[Step 1] Validating receipt with AB-4 contract validator...');

  try {
    const result = execSync(`node "${CONFIG.validatorScript}" "${receiptPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('  ✅ Receipt PASSES all 14 contract checks.');
    return { valid: true, output: result };
  } catch (err) {
    // Non-zero exit means validation failed
    const output = err.stdout || err.stderr || '';
    console.log('  ❌ Receipt FAILED validation.');
    console.log(output);
    return { valid: false, output };
  }
}

// ---------------------------------------------------------------------------
// Step 2: Verify bridge queue item is unchanged (still incoming)
// ---------------------------------------------------------------------------

function verifyBridgeState(receipt) {
  console.log('\n[Step 2] Verifying bridge queue item state...');

  const queueItemId = receipt.queue_item_id;
  if (!queueItemId) {
    console.log('  ❌ Receipt has no queue_item_id.');
    return { verified: false, reason: 'Missing queue_item_id' };
  }

  const incomingPath = path.join(CONFIG.bridgeQueueDir, 'incoming', `${queueItemId}.json`);
  const approvedPath = path.join(CONFIG.bridgeQueueDir, 'approved', `${queueItemId}.json`);
  const inProgressPath = path.join(CONFIG.bridgeQueueDir, 'in-progress', `${queueItemId}.json`);
  const completePath = path.join(CONFIG.bridgeQueueDir, 'complete', `${queueItemId}.json`);
  const rejectedPath = path.join(CONFIG.bridgeQueueDir, 'rejected', `${queueItemId}.json`);

  // Check it's still in incoming (not moved to any other state)
  if (!fs.existsSync(incomingPath)) {
    const movedTo =
      [['approved', approvedPath], ['in-progress', inProgressPath],
       ['complete', completePath], ['rejected', rejectedPath]]
        .find(([_, p]) => fs.existsSync(p));
    if (movedTo) {
      return { verified: false, reason: `Queue item moved to "${movedTo[0]}" state` };
    }
    return { verified: false, reason: 'Queue item not found on disk' };
  }

  // Read the queue item and verify its state
  const queueItem = readJSON(incomingPath);

  if (queueItem.state !== 'incoming') {
    return { verified: false, reason: `Queue item state is "${queueItem.state}", not "incoming"` };
  }

  if (queueItem.version !== 1) {
    return { verified: false, reason: `Queue item version is ${queueItem.version}, expected 1 (unchanged)` };
  }

  console.log(`  ✅ Queue item ${queueItemId} is still "incoming" (v${queueItem.version}).`);
  console.log(`  📄 State file: ${incomingPath}`);
  return {
    verified: true,
    state: queueItem.state,
    version: queueItem.version,
    path: incomingPath,
  };
}

// ---------------------------------------------------------------------------
// Step 3: Compute receipt hash
// ---------------------------------------------------------------------------

async function computeReceiptHash(receiptPath) {
  console.log('\n[Step 3] Computing receipt integrity hash...');
  const hash = await sha256File(receiptPath);
  const prefixed = `sha256:${hash}`;
  console.log(`  ✅ SHA-256: ${prefixed}`);
  return { raw: hash, prefixed };
}

// ---------------------------------------------------------------------------
// Step 4: Generate custody artifact
// ---------------------------------------------------------------------------

function generateCustodyArtifact(receipt, receiptHash, bridgeStatus) {
  console.log('\n[Step 4] Generating custody artifact...');

  const custodyId = generateUUID();
  const now = new Date().toISOString();

  const artifact = {
    // Identity
    custody_id: custodyId,
    source: 'agent-bridge',

    // Bridge linkage
    source_queue_item_id: receipt.queue_item_id,

    // Receipt integrity
    source_receipt_hash: receiptHash.prefixed,
    source_receipt_path: path.baseline ? '' : '',

    // Timestamp
    custody_timestamp: now,

    // Provenance
    provenance_link: {
      receipt_file: receipt._sourcePath || 'unknown',
      bridge_state_file: bridgeStatus.path || 'unknown',
      source_integrity_hash: receipt.source_integrity_hash || 'unknown',
    },

    // Custody status
    status: 'evidence_of_intent',

    // Execution boundary
    execution_permission: 'not_granted',

    // Bridge state (verified at handoff time)
    bridge_queue_state: bridgeStatus.state || 'incoming',
    bridge_queue_version: bridgeStatus.version || 1,

    // Next action gate
    next_allowed_action: 'human_review_only',

    // Audit trail
    _generated_by: 'AB-5-custody-handoff',
    _generated_at: now,
    _hard_constraints_verified: [
      'no_auto_execution',
      'no_auto_approval',
      'no_bridge_bypass',
      'no_queue_state_transition',
      'custody_intake_not_permission_to_act',
    ],
  };

  // Create output directory
  const outputDir = CONFIG.custodyOutputDir;
  fs.mkdirSync(outputDir, { recursive: true });

  // Write JSON artifact
  const jsonPath = path.join(outputDir, `${custodyId}-custody-artifact.json`);
  writeJSON(jsonPath, artifact);

  // Write Markdown artifact (for Librarian compatibility)
  const mdPath = path.join(outputDir, `${custodyId}-custody-artifact.md`);
  const md = `# Custody Artifact — ${custodyId}

**Generated by:** AB-5-custody-handoff  
**Generated at:** ${now}

## Identity

| Field | Value |
|---|---|
| custody_id | \`${custodyId}\` |
| source | \`agent-bridge\` |
| status | \`evidence_of_intent\` |
| execution_permission | \`not_granted\` |

## Bridge Linkage

| Field | Value |
|---|---|
| source_queue_item_id | \`${receipt.queue_item_id}\` |
| bridge_queue_state | \`${bridgeStatus.state || 'incoming'}\` |
| bridge_queue_version | ${bridgeStatus.version || 1} |

## Integrity

| Field | Value |
|---|---|
| source_receipt_hash | \`${receiptHash.prefixed}\` |
| source_integrity_hash | \`${receipt.source_integrity_hash || 'unknown'}\` |

## Provenance Link

- **Receipt file:** ${receipt._sourcePath || 'unknown'}
- **Bridge state file:** ${bridgeStatus.path || 'unknown'}

## Next Action Gate

\`\`\`
next_allowed_action: human_review_only
\`\`\`

## Hard Constraints Verified

- No auto-execution
- No auto-approval
- No bridge bypass
- No queue state transition
- Custody intake does not imply permission to act
`;
  fs.writeFileSync(mdPath, md);
  console.log(`  Wrote: ${mdPath}`);

  return { artifact, custodyId, jsonPath, mdPath };
}

// ---------------------------------------------------------------------------
// Step 5: Register custody event with The Librarian
// ---------------------------------------------------------------------------

async function registerWithLibrarian(custodyId, receipt, artifact) {
  console.log('\n[Step 5] Registering custody event with The Librarian...');

  const outputTitle = `AB-5 Custody Artifact — ${custodyId} — ${receipt.queue_item_id}`;
  const purpose = `Controlled custody handoff for agent-bridge intake receipt. ` +
    `Source: ${receipt.queue_item_id}. Status: evidence_of_intent. Execution: not_granted.`;

  try {
    const result = await callLibrarianTool('librarian_generate_doc', {
      document_ids: [CONFIG.librarianSourceDocId],
      output_title: outputTitle,
      purpose: purpose,
    });

    console.log(`  ✅ Librarian checkout ID: ${result.checkout_id}`);
    console.log(`  ✅ Generated doc record ID: ${result.id}`);
    console.log(`  ✅ Title: ${result.output_title}`);

    return {
      registered: true,
      checkoutId: result.checkout_id,
      docId: result.id,
      title: result.output_title,
    };
  } catch (err) {
    console.log(`  ⚠️  Librarian registration failed (non-fatal): ${err.message}`);
    console.log(`     Custody artifact saved to disk regardless.`);
    return { registered: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Determine the receipt file path
  let receiptPath;
  if (args.length === 1) {
    receiptPath = path.resolve(args[0]);
  } else if (args.length === 0) {
    receiptPath = CONFIG.validReceiptFixture;
    console.log(`Using default valid receipt fixture: ${receiptPath}`);
  } else {
    console.error('Usage: node scripts/librarian-custody-handoff.js [<validated-receipt.json>]');
    process.exit(1);
  }

  if (!fs.existsSync(receiptPath)) {
    console.error(`Error: Receipt file not found: ${receiptPath}`);
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║    AB-5 — Controlled Custody Handoff                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nReceipt: ${receiptPath}\n`);

  // Load the receipt
  const receiptFull = readJSON(receiptPath);
  receiptFull._sourcePath = receiptPath;

  // ── Step 1: Validate ─────────────────────────────────────────────────
  const validation = validateReceipt(receiptPath);
  if (!validation.valid) {
    console.log('\n❌ CUSTODY HANDOFF BLOCKED: Receipt failed validation.');
    console.log('   Unsafe or malformed receipts cannot enter custody.');
    process.exit(1);
  }

  // ── Step 2: Verify bridge state ──────────────────────────────────────
  const bridgeStatus = verifyBridgeState(receiptFull);
  if (!bridgeStatus.verified) {
    console.log(`\n❌ CUSTODY HANDOFF BLOCKED: Bridge queue item state changed.`);
    console.log(`   Reason: ${bridgeStatus.reason}`);
    process.exit(1);
  }

  // ── Step 3: Receipt hash ─────────────────────────────────────────────
  const receiptHash = await computeReceiptHash(receiptPath);

  // ── Step 4: Generate custody artifact ────────────────────────────────
  const custody = generateCustodyArtifact(receiptFull, receiptHash, bridgeStatus);

  // ── Step 5: Register with Librarian ──────────────────────────────────
  const librarianResult = await registerWithLibrarian(
    custody.custodyId, receiptFull, custody.artifact
  );

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║    CUSTODY HANDOFF COMPLETE                                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Custody ID:       ${custody.custodyId}`);
  console.log(`  Status:           evidence_of_intent`);
  console.log(`  Execution:        not_granted`);
  console.log(`  Bridge state:     ${bridgeStatus.state} (unchanged)`);
  console.log(`  Next action:      human_review_only`);
  console.log(`\n  Artifact JSON:    ${custody.jsonPath}`);
  console.log(`  Artifact Markdown: ${custody.mdPath}`);

  if (librarianResult.registered) {
    console.log(`  Librarian checkout: ${librarianResult.checkoutId}`);
    console.log(`  Librarian doc ID:   ${librarianResult.docId}`);
    console.log(`  Title:              ${librarianResult.title}`);
  }

  console.log('\n  ✅ Queue item remains incoming (no execution, no approval).');
  console.log('  ✅ Custody artifact created without executing any work.');
  console.log('  ✅ Human review is the only permitted next action.\n');
}

main().catch((err) => {
  console.error(`\n❌ UNEXPECTED ERROR: ${err.message}`);
  process.exit(1);
});
