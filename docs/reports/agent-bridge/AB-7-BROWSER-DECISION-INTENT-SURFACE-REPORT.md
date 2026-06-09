# AB-7 — Browser Decision Intent Surface Report

**Date:** 2026-06-09
**Status:** ✅ PASSED
**Verifier:** OpenWork Agent

---

## 1. Goal

Allow the paired Chrome extension to submit signed human decision intents to the local system, while preserving The Librarian as the only approval authority.

---

## 2. Governing Rule

```
Extension intent ≠ approval.
Librarian-validated custody decision = approval record.
Approval record ≠ automatic execution.
```

AB-7 implements a **signed intent channel** — not an approval channel.

---

## 3. Trust Chain

| Sprint | Capability | Authority |
|---|---|---|
| AB-5b | Extension identity boundary | Constraint doc |
| AB-6 | Read-only status reflection | Observability |
| **AB-7** | **Signed decision intent submission** | **Intent only** |

AB-6 gave the extension **observability**. AB-7 gives it a **communication path for human intent** — but never authority.

---

## 4. Implementation

### New/Modified Files

| File | Change | Purpose |
|---|---|---|
| `server/src/types.ts` | Extended | `DecisionIntentRequest`, `DecisionIntentResponse`, `DecisionIntentAuditRecord` types |
| `server/src/nonce-store.ts` | **Created** | In-memory nonce deduplication with 10-min TTL and periodic cleanup |
| `server/src/librarian-session.ts` | **Created** | Read-only Librarian MCP session check |
| `server/src/audit-trail.ts` | **Created** | Append-only JSON-lines audit trail for all intents |
| `server/src/http-server.ts` | Extended | `POST /api/decision-intent` handler |
| `tests/ab-7-decision-intent.js` | **Created** | Acceptance test (31 assertions) |

### Endpoint: `POST /api/decision-intent`

The body is a **self-signed envelope** containing all verification fields.

**Request flow:**

```
Extension button click
  → Build signed intent body (custodyId, decisionIntent, clientId, timestamp, nonce, bodyHash, signature)
    → POST /api/decision-intent
      → Bridge validates required fields
        → Bridge validates intent type (approve_requested | reject_requested | defer_requested)
          → Bridge verifies HMAC-SHA256 signature against pairing config
            → Bridge checks nonce deduplication (replay protection)
              → Bridge checks Librarian session
                → Bridge logs to audit trail
                  → Returns extension-safe response
```

**Response (extension-safe, no human identity):**

```json
{
  "accepted": true,
  "extensionVisibleStatus": "decision_intent_recorded",
  "executionPermission": "not_granted",
  "nextRequiredAction": "librarian_validation"
}
```

### Error Responses

| Condition | Status | `extensionVisibleStatus` |
|---|---|---|
| Invalid JSON body | 400 | `invalid_request` |
| Missing required fields | 400 | `missing_fields` |
| Invalid decision_intent value | 400 | `invalid_intent` |
| Unpaired client / bad signature | 401 | `unauthorized` |
| Expired timestamp | 401 | `unauthorized` |
| Duplicate nonce | 409 | `duplicate_intent` |
| No active Librarian session | 503 | `no_active_session` |

---

## 5. Acceptance Test Results

| # | Test | Assertions | Result |
|---|---|---|---|
| 1 | Valid decision intent accepted | 5 | ✅ PASS |
| 2 | Unpaired client receives 401 | 2 | ✅ PASS |
| 3 | Invalid intent value rejected | 2 | ✅ PASS |
| 4 | All valid intent types accepted | 6 | ✅ PASS |
| 5 | Duplicate nonce rejected | 3 | ✅ PASS |
| 6 | Expired timestamp rejected | 2 | ✅ PASS |
| 7 | No human identity in response | 4 | ✅ PASS |
| 8 | Bridge queue state unchanged | 5 | ✅ PASS |
| 9 | Missing fields rejected | 2 | ✅ PASS |
| **Total** | | **31** | **✅ ALL PASS** |

---

## 6. Hard Constraint Verification

| Constraint | Status | Evidence |
|---|---|---|
| Signed request required | ✅ | HMAC-SHA256 verified on every intent |
| Nonce + timestamp required | ✅ | Both validated; replay protection active |
| Replay protection | ✅ | Nonce dedup store; 5-min timestamp window |
| Paired client required | ✅ | 401 for unverified signatures |
| Active Librarian session required | ✅ | 503 if Librarian unreachable |
| Human identity resolved only inside Librarian | ✅ | Response never includes identity fields |
| No human identity returned to extension | ✅ | Test 7 verifies: no human_identity, agent_identity, role |
| No automatic queue approval | ✅ | Queue state unchanged (Test 8) |
| No automatic execution | ✅ | No queue_start or queue_complete called |
| No browser postback | ✅ | Extension polls; bridge doesn't push |

---

## 7. Completed Architecture

| Doc/Sprint | Role |
|---|---|
| `EXTENSION-IDENTITY-BOUNDARY.md` | Identity, data, and theming boundary |
| `DATA-FLOW-MATRIX.md` | Allowed/forbidden flows including human identity |
| AB-6 pairing | HMAC signing, timestamp window, config persistence |
| AB-7 nonce store | Replay attack prevention |
| AB-7 session check | Librarian availability gate |
| AB-7 audit trail | Append-only intent log |

---

## 8. Conclusion

AB-7 is complete. The Chrome extension can now submit signed decision intents (`approve_requested`, `reject_requested`, `defer_requested`) through a verified, replay-protected channel.

Every intent is:
- **Signed** — paired client identity verified
- **Timestamped** — 5-minute freshness window
- **Nonced** — replay attack prevented
- **Audited** — appended to immutable JSON-lines log
- **Session-gated** — Librarian must be reachable

No intent results in queue mutation, execution, or human identity exposure. The extension remains an intent emitter. The Librarian remains the approval authority.

```
AB-7 opens a channel for the human to express intent from the browser.
It does not grant any new authority to the extension.
```
