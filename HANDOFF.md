# agent-bridge — Session Handoff

**Sprint:** AB-8 — Decision Review / Decision Record Viewer
**Status:** 🔍 Pending Human Verification
**Baseline:** cf60830 → 28f3fe9
**Working tree:** clean

---

## What Was Built

**AB-8: Decision Review / Decision Record Viewer**

A read-only decision review surface that lets a human inspect the path from extension intent → bridge audit → Librarian custody/decision record → integrity status → extension-visible status.

### New Files

| File | Purpose |
|---|---|
| `server/src/decision-review.ts` | Read-only endpoint handler — assembles decision records from audit trail, custody artifacts, and queue provenance |
| `extension/review.html` | Decision Review Viewer page — SEC-1 Class E theme tokens, provenance chain visualization |
| `extension/review.js` | Viewer logic — fetches `/api/decisions`, renders status badges, provenance chain, no mutation paths |
| `tests/ab-8-decision-review.js` | Acceptance test — 248 assertions, 15 test suites |
| `docs/reports/agent-bridge/AB-8-DECISION-REVIEW-VIEWER-REPORT.md` | Full report |

### Modified Files

| File | Change |
|---|---|
| `server/src/types.ts` | Added `DecisionReviewPayload`, `DecisionRecordItem` types |
| `server/src/http-server.ts` | Added `GET /api/decisions` route; POST/PUT/DELETE return 405 |
| `extension/popup.html` | Added tab navigation (Submit / Review) with theme-token styling |
| `extension/popup.js` | Added tab switching, review summary, full-viewer link |
| `docs/sprints/AB-8-DECISION-REVIEW-VIEWER.md` | Status: Planned → 🔍 Pending Verification |
| `FEATURE-STATUS.md` | AB-8 entry updated |

### Acceptance Test: 248/248 PASS

| # | Test | Assertions |
|---|---|---|
| 1 | Unpaired client 401 | 2 |
| 2 | Paired client receives payload | 1 |
| 3 | Payload structure matches contract | 17 |
| 4 | Record structure matches contract | ~15 per record |
| 5 | POST returns 405 | 2 |
| 6 | PUT returns 405 | 1 |
| 7 | DELETE returns 405 | 1 |
| 8 | Queue state unchanged | 5 |
| 9 | No authority fields (22 checked) | 22 |
| 10 | No identity fields (9 checked) | 9 |
| 11 | Evidence-based vocabulary | ~per record |
| 12 | No queue_approve/queue_start | 4 |
| 13 | extensionVisibleStatus valid | 1 |
| 14 | Records sorted newest-first | 1 |
| 15 | Bridge identity | 1 |

### Hard Constraints Verified

- No new approval path (GET only; POST/PUT/DELETE → 405)
- No queue mutation (no queue.transition calls)
- No execution trigger (no queue_start/complete)
- No Librarian bypass (reuses existing MCP path)
- No human identity exposure (test 10 asserts)
- No authority fields (test 9 asserts 22 forbidden names absent)
- No CSS/display-state permission (uses existing tokens only)
- No weakening of SEC-1/SEC-1A (Class A/B/E controls inherited)

### Governing Line

```
AB-8 may inspect decisions.
AB-8 may not make decisions.
```

---

## Files NOT Touched

- `server/src/queue.ts` — No queue mutation
- `server/src/tools.ts` — No new MCP tools
- `server/src/nonce-store.ts` — No replay protection needed
- `server/src/librarian-session.ts` — No session gate needed
- `server/src/pairing.ts` — Reused AB-6 pairing
- `extension/background.js` — No new background processing
- `extension/theme/librarian-tokens.css` — Uses existing tokens

---

## Architecture Summary

```
Extension Popup
  ├─ Submit Tab → POST /incoming (existing)
  └─ Review Tab → queue summary + link
                     ↓
         review.html (full page)
           ↓ GET /api/decisions (HMAC-signed)
           ↓
         Decision Review Payload
           ├─ artifactType: decision_review_payload
           ├─ reviewOnly: true
           ├─ executionPermission: not_granted
           ├─ authoritySource: thelibrarian_only
           └─ records[]
                ├─ intent layer (from audit trail)
                ├─ custody layer (from Librarian)
                ├─ queue provenance layer
                └─ integrity status
```

---

## Next Steps

1. Human verification of AB-8 (run `node tests/ab-8-decision-review.js`)
2. Human verification of constraint compliance

## Forward Plan

Three issues identified during AB-8 review:

**1. Persistent Pairing** — "I don't want to give permission every time"
   - One-time pairing → persistent `chrome.storage.local` → works until revoked
   - Fix: auto-discovery via `GET /api/pairing/info` already added; verify persistence works

**2. Decision Context** — "Show what is being approved"
   - Viewer should show evidence context from Librarian/custody, not extension-side interpretation
   - Prompt summary, work packet title, source URL, custody ID, receipt hash, risk class
   - Without custody: limited context block (intent recorded, custody not linked, integrity incomplete)
   - Key rule: viewer may explain the decision, not become the decision authority

**3. Taskbar/Menu Bar Decisions** — "Decide without opening the full app"
   - Safe: taskbar submits signed decision intent → Librarian validates → records decision
   - Unsafe: taskbar calls queue_approve directly (bypasses authority model)
   - Future sprint if pursued

### Recommended Sprint Sequence

| Sprint | Focus | SEC-1 Classes | Status |
|---|---|---|---|
| **AB-9** | Persistent Pairing + Decision Context | A/B/C/E | Planned |
| **AB-10** | Menu Bar / Taskbar Decision Intent Surface | A/B/E | Future |

**AB-9 scope:**
- Persistent pairing (auto-discovery, clear paired/unpaired state)
- Decision context cards (custody-linked, evidence-based)
- Empty/degraded context states
- No approval authority granted by pairing

**AB-10 (future):**
- Menu-bar/taskbar pending count
- Compact decision cards
- Signed approve/reject intent (same AB-7 path)
- Librarian validation required
- No direct queue mutation
- Full audit trail

**Governing distinction preserved:**
```
Pairing proves client identity.
Pairing does not grant approval authority.
Taskbar expresses intent.
Librarian records the decision.
```
