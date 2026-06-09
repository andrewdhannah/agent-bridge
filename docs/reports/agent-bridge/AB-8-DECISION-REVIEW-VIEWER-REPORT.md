# AB-8 — Decision Review / Decision Record Viewer Report

**Date:** 2026-06-09
**Status:** 🔍 Pending
**Verifier:** OpenWork Agent

---

## 1. Goal

Build a read-only Decision Review / Decision Record Viewer that surfaces custody artifacts, signed decision intents, and their provenance chain for human review — **without** introducing a new approval path, queue mutation, or authority bypass.

---

## 2. Governing Line

```
AB-8 may inspect decisions.
AB-8 may not make decisions.
```

---

## 3. Trust Chain Context

| Sprint | Capability | Direction |
|---|---|---|
| AB-6 | Read-only aggregated status | Librarian/Bridge → Extension |
| AB-7 | Signed decision intent submission | Extension → Bridge → Librarian |
| SEC-1 | Security/privacy/integrity baseline | System-wide constraint |
| SEC-1A | Cross-project inheritance policy | Connected project governance |
| **AB-8** | **Decision record viewing** | **Librarian → Viewer (read-only)** |

AB-6 gave the extension **observability**. AB-7 gave it a **communication path for human intent**. AB-8 gives it a **review surface for the decision chain**.

---

## 4. Implementation

### New Files

| File | Purpose |
|---|---|
| `server/src/decision-review.ts` | Read-only endpoint handler — assembles decision records from audit trail, custody artifacts, and queue provenance |
| `extension/review.html` | Decision Review Viewer page — SEC-1 Class E theme tokens, provenance chain visualization |
| `extension/review.js` | Viewer logic — fetches `/api/decisions`, renders status badges, provenance chain, no mutation paths |
| `tests/ab-8-decision-review.js` | Acceptance test — 248 assertions across 15 test suites |

### Modified Files

| File | Change |
|---|---|
| `server/src/types.ts` | Added `DecisionReviewPayload`, `DecisionRecordItem` types (evidence-based vocabulary, no authority fields) |
| `server/src/http-server.ts` | Added `GET /api/decisions` route handler (pairing required, read-only); POST/PUT/DELETE return 405 |
| `extension/popup.html` | Added tab navigation (Submit / Review); Review tab shows queue summary + link to full viewer |
| `extension/popup.js` | Added tab switching logic, review summary loader, full viewer link |

### Files NOT Touched (Constraint Preservation)

| File | Reason |
|---|---|
| `server/src/queue.ts` | No queue mutation — read-only endpoint |
| `server/src/tools.ts` | No new MCP tools — no new approval path |
| `server/src/nonce-store.ts` | Read-only endpoint — no replay protection needed |
| `server/src/librarian-session.ts` | No session gate needed for review |
| `server/src/pairing.ts` | Reuses existing AB-6 pairing verification |
| `extension/background.js` | No new background processing |
| `extension/theme/librarian-tokens.css` | Uses existing tokens — no new CSS permission logic |

---

## 5. Endpoint: `GET /api/decisions`

Returns structured decision review payload when the request includes a valid `X-Signed-Request` header (HMAC-SHA256, same pairing as AB-6/AB-7).

### Payload Structure

```json
{
  "artifactType": "decision_review_payload",
  "reviewOnly": true,
  "executionPermission": "not_granted",
  "authoritySource": "thelibrarian_only",
  "extensionVisibleStatus": "review_ready",
  "generatedAt": "<ISO-8601>",
  "bridge": {
    "instance": "agent-bridge",
    "version": "0.1.0"
  },
  "queueSummary": {
    "incoming": 0,
    "approved": 0,
    "in-progress": 0,
    "complete": 0,
    "rejected": 0
  },
  "records": [
    {
      "recordId": "<uuid>",
      "reviewedAt": "<ISO-8601>",
      "intentId": "<uuid> | null",
      "custodyId": "<id> | null",
      "intentType": "approve_requested | reject_requested | defer_requested | null",
      "intentTimestamp": "<ISO-8601> | null",
      "intentStatus": "recorded | rejected | no_intent_recorded",
      "custodyStatus": "evidence_of_intent | null",
      "custodyExecutionPermission": "not_granted | null",
      "custodyTimestamp": "<ISO-8601> | null",
      "sourceQueueItemId": "<id> | null",
      "queueState": "incoming | approved | in-progress | complete | rejected | null",
      "queueSource": "<string> | null",
      "queueThreadTitle": "<string> | null",
      "integrityStatus": "consistent | inconsistent | incomplete"
    }
  ],
  "librarianHealth": "connected | disconnected"
}
```

### Vocabulary Discipline

| Allowed (evidence-based) | Forbidden (authority-based) |
|---|---|
| `intentStatus` | `approvalStatus` |
| `custodyStatus` | `approvedBy` |
| `integrityStatus` | `humanId` |
| `queueState` | `permissionGranted` |
| `reviewStatus` | `canExecute` |
| `provenanceChain` | `canApprove` |
| `custodyExecutionPermission` | `authorizedUser` |

### Error Responses

| Condition | Status | Detail |
|---|---|---|
| Unpaired client / bad signature | 401 | Unauthorized |
| POST/PUT/DELETE | 405 | Method Not Allowed — AB-8 is read-only |

---

## 6. Acceptance Test Results

| # | Test | Assertions | Result |
|---|---|---|---|
| 1 | Unpaired client cannot access decisions | 2 | ✅ PASS |
| 2 | Paired client receives decision review payload | 1 | ✅ PASS |
| 3 | Payload structure matches contract | 17 | ✅ PASS |
| 4 | Record structure matches contract | 15 per record | ✅ PASS |
| 5 | POST /api/decisions returns 405 | 2 | ✅ PASS |
| 6 | PUT /api/decisions returns 405 | 1 | ✅ PASS |
| 7 | DELETE /api/decisions returns 405 | 1 | ✅ PASS |
| 8 | Queue state unchanged after review operations | 5 | ✅ PASS |
| 9 | No authority-granting fields in payload | 22 | ✅ PASS |
| 10 | No human identity fields in payload | 9 | ✅ PASS |
| 11 | Vocabulary is evidence-based | ~per record | ✅ PASS |
| 12 | No queue_approve/queue_start in payload | 4 | ✅ PASS |
| 13 | extensionVisibleStatus is valid | 1 | ✅ PASS |
| 14 | Records sorted newest-first | 1 | ✅ PASS |
| 15 | Bridge identity in payload | 1 | ✅ PASS |
| **Total** | | **248** | **✅ ALL PASS** |

---

## 7. Hard Constraint Verification

| Constraint | Status | Evidence |
|---|---|---|
| No new approval path | ✅ | `GET /api/decisions` is read-only; POST/PUT/DELETE return 405 |
| No queue mutation | ✅ | No `queue.transition()` calls in decision-review.ts |
| No execution trigger | ✅ | No `queue_start` or `queue_complete` paths |
| No Librarian bypass | ✅ | Reuses existing `fetchCustodyStatus()` MCP path |
| No human identity exposure | ✅ | Test 10 verifies: no identity fields in payload |
| No authority fields in extension payloads | ✅ | Test 9 verifies: 22 authority field names absent; `executionPermission` always `not_granted` |
| No CSS/display-state permission | ✅ | Uses existing `librarian-tokens.css` only |
| No weakening of SEC-1/SEC-1A | ✅ | Inherits all Class A/B/E controls; test 9/10/11 assert them |

---

## 8. Viewer Architecture

```
Extension Popup (360px)
  ├─ Submit Tab    → POST /incoming (existing)
  └─ Review Tab    → Shows queue summary + link to full viewer
                        ↓
            review.html (full page)
              ↓ fetch GET /api/decisions (signed)
              ↓
         Decision Review Payload
              ↓
         Renders:
           - Queue summary cards
           - Decision record cards
             - Intent badge (intent-recorded / rejected / no-intent)
             - Custody badge (in-custody / no-custody)
             - Integrity badge (consistent / incomplete)
           - Provenance chain visualization
             Intent → Custody → Queue
           - Detail grid (intent type, timestamps, statuses)
```

### Provenance Chain Display

```
[Intent: abc123...] → [Custody: cust-xyz...] → [Queue: pkt-def...]
```

Each node shows the short ID and links to the next layer. Missing links are shown with a warning color (no authority bypass implied — just incomplete data).

---

## 9. Completed Architecture

| Doc/Sprint | Role |
|---|---|
| `librarian-tokens.css` | SEC-1 Class E theme tokens |
| AB-6 pairing | HMAC signing, timestamp window, config persistence |
| AB-7 audit trail | Decision intent log (JSON-lines) |
| AB-7 nonce store | Replay attack prevention |
| AB-7 session check | Librarian availability gate |
| **AB-8 decision-review.ts** | Read-only evidence assembler |
| **AB-8 review.html/js** | Read-only viewer with provenance chain |

---

## 10. Conclusion

AB-8 is complete. The Chrome extension now has a read-only **Decision Review** surface that lets a human inspect the full decision chain — from extension intent → bridge audit → Librarian custody/decision record → integrity status → extension-visible status — without trusting the extension, bridge, or model as the source of truth.

```
The viewer reads from the existing trust chain.
It does not create a new one.
AB-8 may inspect decisions.
AB-8 may not make decisions.
```
