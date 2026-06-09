# AB-4 — Librarian Intake Contract Validation Report

**Date:** 2026-06-09
**Status:** ✅ PASSED
**Verifier:** OpenWork Agent

---

## 1. Goal

Verify that The Librarian (or any receiver) can independently validate
agent-bridge intake receipt artifacts and **refuse malformed, unsafe, or
execution-tainted artifacts** before accepting them into custody.

**Core principle:** A receipt is not trusted because agent-bridge generated it.
The receiver must independently validate the receipt contract before accepting
it as intake evidence. Safe receipt generation (AB-3) is distinct from safe
receipt acceptance (AB-4).

---

## 2. Contract Source

The validation contract is derived from three architecture documents:

| Document | Key Constraints |
|---|---|
| `docs/architecture/APPROVAL-HANDOFF-CONTRACT.md` | Source identity, handoff sequence, authority separation |
| `docs/architecture/AUDIT-PROVENANCE-MAPPING.md` | SHA-256 chain of custody, provenance adapter requirement |
| `docs/architecture/NO-AUTO-EXECUTION-GUARANTEE.md` | Execution must not have occurred; human-only next action |

---

## 3. Implementation

### Validation Harness

**File:** `scripts/validate-librarian-intake-receipt.js`

A receiver-side, standalone Node.js validator that reads a receipt JSON file
and runs 14 independent checks. It is designed to **fail closed**: any
unexpected condition (unreadable file, unparseable JSON, missing field) exits
non-zero.

### Validation Checks (14 total)

| # | Check | Field Test |
|---|---|---|
| 1 | **Source identity** | `source === "agent-bridge"` |
| 2 | **Artifact type** | `artifact_type === "librarian_intake_receipt"` |
| 3 | **Queue item present** | `queue_item_id` is non-empty string |
| 4 | **Timestamps present** | `capture_timestamp` and `intake_timestamp` are non-empty strings |
| 5 | **Integrity hash present** | `source_integrity_hash` is non-empty string |
| 6 | **Integrity hash format** | `source_integrity_hash` matches `sha256:<64 hex chars>` |
| 7 | **Provenance adapter** | `provenance.intake_adapter` is non-empty string |
| 8 | **Bridge state** | `provenance.bridge_state_at_intake === "incoming"` |
| 9 | **Execution status** | `execution.status === "not_executed"` |
| 10 | **Execution not attempted** | `execution.execution_attempted === false` |
| 11 | **Approval not granted** | `execution.approval_granted === false` |
| 12 | **Next action** | `next_allowed_action === "human_review_only"` |
| 13 | **Risk classification** | `risk.classification` is non-empty string |
| 14 | **Approval required** | `risk.approval_required === true` |

---

## 4. Test Fixtures

**File:** `tests/fixtures/agent-bridge-intake/valid-receipt.json`
A correct receipt conforming to all 14 contract checks.

Eight negative fixtures, each violating exactly one aspect of the contract:

| Fixture | Violation | Expected | Actual |
|---|---|---|---|
| `valid-receipt.json` | (none — baseline) | PASS (14/14) | ✅ PASS (14/14) |
| `invalid-missing-hash.json` | Missing `source_integrity_hash` | FAIL | ✅ FAIL (12/14) |
| `invalid-wrong-source.json` | `source` = `malicious-extension` | FAIL | ✅ FAIL (13/14) |
| `invalid-execution-tainted.json` | `execution.status` = `executed` | FAIL | ✅ FAIL (11/14, 3 failures) |
| `invalid-approval-pre-granted.json` | `approval_granted` = `true` | FAIL | ✅ FAIL (13/14) |
| `invalid-wrong-next-action.json` | `next_allowed_action` = `auto_execute` | FAIL | ✅ FAIL (13/14) |
| `invalid-bridge-state-approved.json` | `bridge_state_at_intake` = `approved` | FAIL | ✅ FAIL (13/14) |
| `invalid-missing-provenance-adapter.json` | Missing `provenance.intake_adapter` | FAIL | ✅ FAIL (13/14) |
| `invalid-malformed-artifact-type.json` | `artifact_type` = `unsolicited_execution_order` | FAIL | ✅ FAIL (13/14) |

All 9 fixtures pass/fail as expected.

---

## 5. Acceptance Criteria Results

| Criterion | Result |
|---|---|
| Valid AB-3 receipt passes (exit 0) | ✅ Passed |
| All malformed/unsafe fixtures fail (exit 1) | ✅ Passed — all 8 |
| Validator exits non-zero if any unsafe fixture accepted | ✅ Guaranteed by design (fail closed) |
| Validator exits non-zero if valid receipt rejected | ✅ N/A — valid receipt passes |
| Report states Librarian accepts only validated intake artifacts | ✅ This report |

---

## 6. Key Distinction: Generation vs. Acceptance

AB-3 proved that agent-bridge can **generate** safe intake receipts with
provenance, integrity hashes, and explicit `not_executed` status.

AB-4 proves that The Librarian (or any receiver) must **independently validate**
those receipts before accepting them into custody. Generation is not trust.
The receiver-side validator enforces the full intake contract and refuses
any receipt that deviates from it — even if the receipt claims to come from
agent-bridge.

---

## 7. Hard Constraint Verification

| Constraint | Status |
|---|---|
| No queue items executed | ✅ Verified — no calls to `queue_start`, `queue_approve`, or `queue_complete` |
| No queue items approved | ✅ Verified |
| No local agents started | ✅ Verified |
| No browser postback | ✅ Verified |
| No browser UI driven | ✅ Verified |
| Receipt generation ≠ sufficient trust | ✅ Verified — validator enforces independent checks |
| Validation is receiver-side | ✅ Verified — `validate-librarian-intake-receipt.js` is standalone |
| Validation fails closed | ✅ Verified — any error (parse failure, missing field) exits 1 |
| Scope not expanded to full Librarian integration | ✅ Verified — strictly intake contract validation |

---

## 8. Conclusion

AB-4 is complete. The receiver-side validation harness enforces a 14-point
intake contract that independently verifies source identity, artifact type,
integrity hash format, provenance, bridge state, execution status, and risk
classification before a receipt can be accepted into custody.

**Safe receipt generation is necessary but not sufficient. Safe receipt
acceptance requires independent validation that fails closed.**

The Librarian now has a mechanism to accept only validated intake artifacts
and refuse unsafe, malformed, or execution-tainted artifacts on the receiver
side — before they enter custody.
