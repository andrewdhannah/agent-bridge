# AB-8 Implementation Handoff

## Sprint

AB-8 — Decision Review / Decision Record Viewer

## Baseline

```text
Repository: agent-bridge
Baseline commit: cf60830
Working tree: clean
Security inheritance: Class A, Class B, Class E
```

## Governing line

```text
AB-8 may inspect decisions.
AB-8 may not make decisions.
```

## Existing architecture

The existing data flow is already sufficient:

- AB-6: `GET /api/status` returns queue + custody status, read-only, paired.
- AB-7: `POST /api/decision-intent` logs intents to `audit/decision-intents.jsonl`.
- `audit-trail.ts`: already has `readRecentIntents()` to read intent records.
- `custody-status.ts`: already has `fetchCustodyStatus()` to query The Librarian.

## Intended AB-8 addition

Add a dedicated read-only endpoint:

```text
GET /api/decisions
```

It should join:

- audit trail intent records
- custody artifacts
- queue provenance
- integrity status
- extension-visible status

into a read-only decision review payload.

## New files

| File | Purpose |
|---|---|
| `server/src/decision-review.ts` | Read-only endpoint handler. Assembles decision records from audit trail, custody, and queue provenance. |
| `extension/review.html` | Decision Review Viewer page. Full-width page opened from popup link. |
| `extension/review.js` | Viewer logic. Fetches `/api/decisions` and renders status badges and provenance chain. |
| `tests/ab-8-decision-review.js` | Acceptance test. Reads only; verifies no writes and no identity leaks. |

## Modified files

| File | Change |
|---|---|
| `server/src/types.ts` | Add `DecisionReviewPayload` type. |
| `server/src/http-server.ts` | Add `GET /api/decisions` route handler. Must require pairing and remain read-only. |
| `extension/popup.html` | Add navigation link/tab to open review viewer. |
| `extension/popup.js` | Add review navigation handler. |

## Files not to touch

| File | Reason |
|---|---|
| `server/src/queue.ts` | No queue mutation. |
| `server/src/tools.ts` | No new MCP tools; no approval path. |
| `server/src/nonce-store.ts` | Not applicable to read-only endpoint. |
| `server/src/librarian-session.ts` | Decision review does not gate on session. |
| `server/src/pairing.ts` | Reuse existing AB-6 pairing verification. |
| `extension/background.js` | No new background processing. |
| `extension/theme/librarian-tokens.css` | Existing tokens only; no CSS permission logic. |

## Recommended payload posture

```ts
{
  artifact_type: "decision_review_payload",
  review_only: true,
  execution_permission: "not_granted",
  authority_source: "thelibrarian_only",
  extension_visible_status: "...",
  records: []
}
```

Do not add authority-looking fields to extension-visible payloads.

## Required negative tests

The AB-8 acceptance test should assert:

- `GET /api/decisions` works for paired clients.
- `POST /api/decisions` returns `404` or `405`.
- `PUT /api/decisions` returns `404` or `405`.
- `DELETE /api/decisions` returns `404` or `405`.
- Queue counts remain unchanged before/after review calls.
- Custody artifacts remain unchanged before/after review calls.
- No `queue_approve` path exists.
- No `queue_start` path exists.
- No human identity fields appear.
- No authority-granting fields appear.
- `execution_permission` is `not_granted`.
- `review_only` is `true`.

## Completion test

AB-8 closes only when this is true:

```text
A human can independently inspect the decision chain without trusting the extension, bridge, or model as the source of truth.
```
