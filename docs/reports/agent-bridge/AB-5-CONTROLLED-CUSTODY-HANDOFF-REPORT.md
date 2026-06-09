# AB-5 — Controlled Custody Handoff Report

**Date:** 2026-06-09
**Status:** ✅ PASSED
**Verifier:** OpenWork Agent

---

## 1. Goal

Accept a validated `agent-bridge` intake receipt into The Librarian custody chain
as **evidence of intent**, without executing or approving the underlying bridge
queue item.

---

## 2. Core Distinction

| Sprint | What was proven | Trust level |
|---|---|---|
| AB-3 | **Generate** safe receipt (producer-side) | Necessary but insufficient |
| AB-4 | **Validate** receipt before custody (receiver-side) | Receiver independently verifies contract |
| AB-5 | **Custody** — assign provenance inside The Librarian | Evidence of intent, not permission to act |

---

## 3. Implementation

**File:** `scripts/librarian-custody-handoff.js`

A 5-step custody handoff process:

| Step | Action | Verification |
|---|---|---|
| 1 | Validate receipt (invokes AB-4 validator) | Receipt passes all 14 contract checks |
| 2 | Verify bridge queue item state | Queue item is still `incoming` (v1, unmodified) |
| 3 | Compute SHA-256 of receipt file | Integrity hash for provenance chain |
| 4 | Generate custody artifact | 10 required fields, JSON + Markdown |
| 5 | Register with The Librarian | `librarian_generate_doc` creates checkout + generated doc record |

### Custody Artifact Fields

| Field | Value | Source |
|---|---|---|
| `custody_id` | UUID v4 | Generated at handoff time |
| `source` | `agent-bridge` | From validated receipt |
| `source_queue_item_id` | `aed47276-...` | From validated receipt |
| `source_receipt_hash` | `sha256:231d...` | SHA-256 of receipt file |
| `custody_timestamp` | ISO 8601 | Generation time |
| `provenance_link` | receipt + bridge state paths | Verified file locations |
| `status` | `evidence_of_intent` | Custody classification |
| `execution_permission` | `not_granted` | Hard boundary |
| `bridge_queue_state` | `incoming` | Verified from disk |
| `next_allowed_action` | `human_review_only` | Next action gate |

---

## 4. Acceptance Test Results

| Criterion | Result |
|---|---|
| Validated receipt → custody artifact | ✅ Created at `docs/custody/agent-bridge/` |
| Queue item remains `incoming` | ✅ Verified — state unchanged, version 1 |
| Execution permission `not_granted` | ✅ Enforced in artifact |
| Next action is `human_review_only` | ✅ Enforced in artifact |
| Librarian custody record created | ✅ Checkout `4A2623A0-...`, doc ID 5 |
| No queue state transition | ✅ Item never moved from `incoming/` |
| No execution tools called | ✅ No `queue_start`, `queue_approve`, `queue_complete` |

---

## 5. Hard Constraint Verification

| Constraint | Status | Evidence |
|---|---|---|
| No auto-execution | ✅ Verified | Queue item still `incoming` |
| No auto-approval | ✅ Verified | Bridge has no approved state for this item |
| No bridge bypass | ✅ Verified | All steps go through validator → handoff → Librarian |
| No queue state transition | ✅ Verified | Item at `incoming`, version 1 (unchanged) |
| No browser postback | ✅ Verified | No HTTP calls to browser (only Librarian MCP) |
| Custody ≠ permission | ✅ Verified | `execution_permission: not_granted` |

---

## 6. Librarian Integration

The custody handoff registers the event with The Librarian via `librarian_generate_doc`:

- **Checkout ID:** `4A2623A0-5BD8-43EC-9A32-7C5BB08036C4`
- **Doc Record ID:** `5`
- **Verification status:** `pending` (awaiting human review)
- **Created by:** `agent`

The generated doc record is marked `pending` — it cannot self-verify. A human
must review and confirm the custody artifact.

---

## 7. Conclusion

AB-5 is complete. The complete three-gate trust chain is now established:

```
AB-3: Generate (producer-side)
  → AB-4: Validate (receiver-side)
    → AB-5: Custody (Librarian-side)
```

A validated receipt now enters The Librarian's custody chain as `evidence_of_intent`,
with `execution_permission: not_granted` and `next_allowed_action: human_review_only`.
The bridge queue item remains `incoming` and unmodified. No execution has occurred.
No approval has been granted. Custody does not imply permission to act.
