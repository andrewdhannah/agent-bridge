# AB-7 — Browser Decision Intent Surface

**Status:** Planned
**Owner:** OpenWork Agent
**Dependency:** AB-5b (`docs/architecture/EXTENSION-IDENTITY-BOUNDARY.md`), AB-6 (`server/src/pairing.ts`)

---

## Goal

Allow the paired Chrome extension to submit signed human decision intents to the local system, while preserving The Librarian as the only approval authority.

---

## Core Rule

```
Extension intent ≠ approval.
Librarian-validated custody decision = approval record.
Approval record ≠ automatic execution.
```

---

## Trust Chain Context

| Sprint | Capability | Direction |
|---|---|---|
| AB-5b | Extension identity boundary defined | Constraint doc |
| AB-6 | Read-only status reflection | Bridge → Extension |
| **AB-7** | **Signed decision intent submission** | **Extension → Bridge → Librarian** |

AB-6 gave the extension **observability**. AB-7 gives it a **communication path for human intent** — but never authority.

---

## Scope

### In scope

- `POST /api/decision-intent` endpoint on the bridge server
- Accepts a signed envelope containing `custody_id`, `decision_intent`, `client_id`, `timestamp`, `nonce`, `body_hash`, `signature`
- Verifies extension pairing (reuses AB-6 `pairing.ts`)
- Verifies nonce + timestamp replay protection
- Verifies Librarian session is active
- Routes the intent to The Librarian for validation
- Returns extension-safe response only (no human identity, no approval grant)
- Logs the intent in the bridge audit trail

### Not in scope

- No automatic queue approval (the bridge does not call `queue_approve`)
- No automatic execution (no `queue_start` or `queue_complete`)
- No browser postback or UI injection
- No human identity returned to the extension
- No custody mutation from the extension
- No Librarian bypass

---

## Hard Boundaries

- Signed request required
- Nonce + timestamp required
- Replay protection required (5-minute window, reuse detection)
- Paired client required (HMAC signature verified)
- Active Librarian session required
- Human identity resolved only inside The Librarian
- No human identity returned to extension
- No automatic queue approval
- No automatic execution
- No browser postback

---

## Implementation Target

### Endpoint: `POST /api/decision-intent`

**Request:**

```json
{
  "custody_id": "CUST-...",
  "decision_intent": "approve_requested",
  "client_id": "chrome-extension-local-1",
  "timestamp": "2026-06-09T12:00:00Z",
  "nonce": "random-nonce",
  "body_hash": "sha256:...",
  "signature": "hmac-sha256:..."
}
```

**Valid `decision_intent` values:**
- `approve_requested`
- `reject_requested`
- `defer_requested`

**Response (extension-safe, no human identity):**

```json
{
  "accepted": true,
  "extension_visible_status": "decision_intent_recorded",
  "execution_permission": "not_granted",
  "next_required_action": "librarian_validation"
}
```

**Error responses:**

| Condition | Status | `extension_visible_status` |
|---|---|---|
| Missing or invalid signature | 401 | `unauthorized` |
| Expired timestamp | 401 | `replay_rejected` |
| Duplicate nonce | 409 | `duplicate_intent` |
| Unknown custody_id | 404 | `custody_not_found` |
| No active Librarian session | 503 | `no_active_session` |
| Librarian validation failed | 200 (accepted=false) | `validation_failed` |

---

## Acceptance Criteria

1. Paired extension submits valid decision intent → receives `decision_intent_recorded`
2. Unpaired client submits intent → receives 401
3. Expired timestamp → receives 401 with `replay_rejected`
4. Duplicate nonce → receives 409
5. Response never includes `human_identity` or `agent_identity`
6. Bridge queue state is unchanged after intent submission
7. No `queue_approve`, `queue_start`, or `queue_complete` is called
8. Intent is logged in bridge audit trail

---

## Reuse from AB-6

| AB-6 Component | Reuse in AB-7 |
|---|---|
| `server/src/pairing.ts` | Signature verification, timestamp window check, config loading |
| `server/src/types.ts` | `SignedEnvelope`, `PairingConfig` types |
| `server/bridge-config.json` | Client secret for signature verification |
| `scripts/bridge-pair.js` | Pairing config generation |

---

## New Deliverables

- `POST /api/decision-intent` handler in `server/src/http-server.ts`
- Nonce deduplication store (in-memory with TTL or file-based)
- Librarian session check utility
- Audit trail logging for submitted intents
- Acceptance tests for all 8 criteria
- AB-7 report

---

## Boundaries to Preserve

```
Decision intent submission → communication, not authority
  ├─ No queue approval
  ├─ No queue state change
  ├─ No execution
  ├─ No custody mutation
  ├─ No human identity exposure
  └─ No Librarian bypass
```

AB-7 opens a channel for the human to express intent from the browser. It does not grant any new authority to the extension.
