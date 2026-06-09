#!/usr/bin/env node
/**
 * validate-librarian-intake-receipt.js
 *
 * AB-4: Receiver-side intake receipt validation harness.
 *
 * The Librarian (or any receiver) uses this to independently validate
 * that an agent-bridge intake receipt satisfies the intake contract.
 *
 * Contract source: docs/architecture/APPROVAL-HANDOFF-CONTRACT.md
 *                  docs/architecture/AUDIT-PROVENANCE-MAPPING.md
 *                  docs/architecture/NO-AUTO-EXECUTION-GUARANTEE.md
 *
 * Principle: A receipt is NOT trusted because agent-bridge generated it.
 * The receiver must independently validate the receipt contract before
 * accepting it as intake evidence.
 *
 * Usage:
 *   node scripts/validate-librarian-intake-receipt.js <receipt-file.json>
 *
 * Exit codes:
 *   0 — All checks passed (valid receipt)
 *   1 — One or more checks failed (invalid receipt)
 *
 * Hard constraint: Fail closed. Any unexpected condition → exit 1.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Validation checks
// ---------------------------------------------------------------------------

const CHECKS = [
  // 1. source === "agent-bridge"
  {
    key: 'source',
    test: (r) => r.source === 'agent-bridge',
    msg: 'source must equal "agent-bridge"',
  },

  // 2. artifact_type === "librarian_intake_receipt"
  {
    key: 'artifact_type',
    test: (r) => r.artifact_type === 'librarian_intake_receipt',
    msg: 'artifact_type must be "librarian_intake_receipt"',
  },

  // 3. queue_item_id present and non-empty
  {
    key: 'queue_item_id',
    test: (r) => typeof r.queue_item_id === 'string' && r.queue_item_id.length > 0,
    msg: 'queue_item_id must be present and non-empty',
  },

  // 4. capture_timestamp and intake_timestamp present
  {
    key: 'timestamps',
    test: (r) =>
      typeof r.capture_timestamp === 'string' && r.capture_timestamp.length > 0 &&
      typeof r.intake_timestamp === 'string' && r.intake_timestamp.length > 0,
    msg: 'capture_timestamp and intake_timestamp must be present and non-empty',
  },

  // 5. source_integrity_hash present
  {
    key: 'source_integrity_hash',
    test: (r) =>
      typeof r.source_integrity_hash === 'string' && r.source_integrity_hash.length > 0,
    msg: 'source_integrity_hash must be present and non-empty',
  },

  // 6. source_integrity_hash must use valid SHA-256 format (sha256:<64 hex chars>)
  {
    key: 'source_integrity_hash_format',
    test: (r) => /^sha256:[0-9a-f]{64}$/i.test(r.source_integrity_hash),
    msg: 'source_integrity_hash must have valid sha256:... format (64 hex chars)',
  },

  // 7. provenance.intake_adapter present
  {
    key: 'provenance_intake_adapter',
    test: (r) =>
      r.provenance &&
      typeof r.provenance.intake_adapter === 'string' &&
      r.provenance.intake_adapter.length > 0,
    msg: 'provenance.intake_adapter must be present and non-empty',
  },

  // 8. provenance.bridge_state_at_intake === "incoming"
  {
    key: 'bridge_state_at_intake',
    test: (r) =>
      r.provenance &&
      r.provenance.bridge_state_at_intake === 'incoming',
    msg: 'provenance.bridge_state_at_intake must be "incoming"',
  },

  // 9. execution.status === "not_executed"
  {
    key: 'execution_status',
    test: (r) =>
      r.execution &&
      r.execution.status === 'not_executed',
    msg: 'execution.status must be "not_executed"',
  },

  // 10. execution.execution_attempted === false
  {
    key: 'execution_attempted',
    test: (r) =>
      r.execution &&
      r.execution.execution_attempted === false,
    msg: 'execution.execution_attempted must be false',
  },

  // 11. execution.approval_granted === false
  {
    key: 'approval_granted',
    test: (r) =>
      r.execution &&
      r.execution.approval_granted === false,
    msg: 'execution.approval_granted must be false',
  },

  // 12. next_allowed_action === "human_review_only"
  {
    key: 'next_allowed_action',
    test: (r) => r.next_allowed_action === 'human_review_only',
    msg: 'next_allowed_action must be "human_review_only"',
  },

  // 13. risk.classification present
  {
    key: 'risk_classification',
    test: (r) =>
      r.risk &&
      typeof r.risk.classification === 'string' &&
      r.risk.classification.length > 0,
    msg: 'risk.classification must be present and non-empty',
  },

  // 14. risk.approval_required must be true (explicit approval requirement)
  {
    key: 'risk_approval_required',
    test: (r) =>
      r.risk &&
      r.risk.approval_required === true,
    msg: 'risk.approval_required must be true',
  },
];

// ---------------------------------------------------------------------------
// Validate a single receipt
// ---------------------------------------------------------------------------

function validate(receipt) {
  const results = CHECKS.map((check) => ({
    key: check.key,
    message: check.msg,
    passed: check.test(receipt),
  }));

  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  return { results, passed, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: node scripts/validate-librarian-intake-receipt.js <receipt-file.json>');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);

  let receipt;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    receipt = JSON.parse(raw);
  } catch (err) {
    console.error(`FAIL: Cannot read or parse receipt file: ${filePath}`);
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }

  const { results, passed, failed } = validate(receipt);

  const fileName = path.basename(filePath);

  console.log(`\n=== INTAKE RECEIPT VALIDATION: ${fileName} ===\n`);

  for (const r of results) {
    const icon = r.passed ? '  PASS' : '  FAIL';
    console.log(`${icon}  ${r.message}`);
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Total checks : ${results.length}`);
  console.log(`  Passed       : ${passed.length}`);
  console.log(`  Failed       : ${failed.length}`);

  if (failed.length === 0) {
    console.log(`\n  RESULT: VALID — Receipt satisfies intake contract.\n`);
    process.exit(0);
  } else {
    console.log(`\n  RESULT: INVALID — Receipt FAILED ${failed.length} check(s). Refusing custody.\n`);
    process.exit(1);
  }
}

main();
