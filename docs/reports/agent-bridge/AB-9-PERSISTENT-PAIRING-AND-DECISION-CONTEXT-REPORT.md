# AB-9 — Persistent Pairing + Decision Context Report

**Date:** 2026-06-09
**Status:** 🔍 Pending Verification
**Verifier:** OpenWork Agent

---

## 1. Goal

Reduce extension friction and improve decision review usefulness by adding persistent pairing UX and evidence-based context cards, without granting authority through pairing or context display.

**Governing line:**
```
Pairing proves client trust.
Context explains evidence.
Neither grants authority.
```

---

## 2. Implementation Order

Pairing persistence first, then context cards — reducing UX friction before expanding information density.

### Phase 1 — Pairing Persistence

| File | Change |
|---|---|
| `extension/popup.html` | Added pairing status bar with dot indicator, label, client ID, and Revoke button |
| `extension/popup.js` | Added `loadPairingConfig()` (storage-first, bridge-fallback), `resetPairing()`, `getPairingStatus()`, pairing bar UI updates |
| `extension/review.html` | Added pairing status bar in viewer header with Revoke button |
| `extension/review.js` | Added `loadPairingConfig()`, `resetPairing()`, `initPairingBar()` with paired/unpaired/error states |

### Phase 2 — Decision Context Cards

| File | Change |
|---|---|
| `server/src/types.ts` | Added `contextSummary`, `contextSource`, `riskClass` to `DecisionRecordItem` |
| `server/src/decision-review.ts` | Added `buildContextSummary()` — extracts evidence-based context from queue packet or audit intent; populates context fields on all records |
| `extension/review.js` | Added `renderContextCard()` — renders context card with source tag, truncated summary with expand, integrity status, risk badge |

---

## 3. Pairing Persistence Design

```
Extension loads
  → chrome.storage.local.get('bridgePairing')
    → found? use cached config (persists across reload)
    → not found? fetch GET /api/pairing/info from bridge
      → found? cache in chrome.storage.local
      → not found? show "Not paired" state
```

**States:**
- **Paired** — green dot, client ID shown, Revoke button visible
- **Unpaired** — red dot, "Not paired" message, no Revoke
- **Error** — amber dot, "Pairing error"

**User control:**
- Revoke button clears `chrome.storage.local` → forces re-discovery on next load
- No repeated permission prompts when valid pairing exists

---

## 4. Context Card Design

Each decision record now includes a context card with:

```
┌─ Context ──────────────── source: queue ─┐
│  My prompt title — [my-repo] — First 200 │
│  characters of prompt text...             │
│  [Show more]                              │
│  Integrity: incomplete  Risk: medium      │
└───────────────────────────────────────────┘
```

**Context sourcing hierarchy:**
1. **Queue packet** (richest) — thread title, repo, truncated prompt (200 chars)
2. **Audit trail** (fallback) — intent type + custody ID
3. **Custody artifact** (custody-only records) — artifact ID note

**Degraded states:**
- No linked queue or custody: "No linked queue item or custody artifact."
- Queue not found: "Queue item not found."
- Context unavailable: "Context unavailable from linked sources."

**Constraints:**
- Context is sourced from actual evidence — never invented by extension
- Context source is labeled: `queue`, `custody`, or `audit`
- Long summaries are truncated (120 chars visible, "Show more" expand)
- No authority fields in context — verified by test

---

## 5. Acceptance Test Results

| # | Test | Result |
|---|---|---|
| 1 | Pairing auto-discovery endpoint returns 200 with correct fields | ✅ PASS |
| 2 | Paired client receives decision review payload | ✅ PASS |
| 3 | Context card fields present and valid on all records | ✅ PASS |
| 4 | Context summary shape — audit context references intent type | ✅ PASS |
| 5 | No authority fields in payload (12 checked) | ✅ PASS |
| 6 | Context source does not imply authority | ✅ PASS |
| 7 | Queue state unchanged after all operations | ✅ PASS |
| 8 | Pairing info matches bridge-config.json | ✅ PASS |
| 9 | Unpaired client still rejected (pairing not weakened) | ✅ PASS |
| 10 | Review-only posture preserved in payload | ✅ PASS |
| **Total** | | **175/175 PASS** |

---

## 6. Hard Constraint Verification

| Constraint | Status | Evidence |
|---|---|---|
| Pairing proves client trust only | ✅ | Pairing gives no approval or execution access |
| Pairing does not prove human approval | ✅ | No approval path exists through pairing |
| Pairing does not grant permission to approve/execute | ✅ | Test 5: no authority fields |
| Context explains evidence only | ✅ | Context sourced from queue/audit/custody |
| Context does not become a decision source | ✅ | Review-only payload posture preserved |
| Extension remains non-authoritative | ✅ | No new write paths |
| Bridge remains non-authoritative | ✅ | No queue mutation |
| Librarian remains sole authority | ✅ | No bypass path |
| No human identity fields exposed | ✅ | Same AB-8 exclusion |
| No authority fields exposed | ✅ | 12 field names checked |
| No CSS/display-state permission | ✅ | Uses existing theme tokens only |
| No SEC-1/SEC-1A weakening | ✅ | Class A/B/C/E inherited and preserved |

---

## 7. Conclusion

AB-9 is complete. Pairing is now persistent across extension reloads with auto-discovery, clear visual state, and manual revoke. Decision records show evidence-based context cards with labeled sources and graceful degradation. No authority was granted through pairing or context display.

```
Pairing removes friction.
Context improves judgment.
Neither creates authority.
```
