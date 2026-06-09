# AB-9 — Persistent Pairing + Decision Context

**Status:** Planned
**Owner:** OpenWork Agent
**Dependencies:** AB-8 (`GET /api/decisions`, Decision Review Viewer), AB-7 (signed intent path), AB-6 (pairing model)

---

## Governing Distinction

```
Pairing proves client trust.
Context explains evidence.
Neither grants authority.
```

---

## Security Inheritance Classification

| Class | Category | Applied? | Notes |
|---|---|---|---|
| **A** | Authority-touching | ✅ Yes | Pairing is the client identity proof; must never imply approval authority |
| **B** | Custody/provenance-touching | ✅ Yes | Decision context cards display custody/provenance evidence |
| **C** | Privacy/export-touching | ✅ Yes | Decision context may include prompt text, file names, repo names, task details |
| **E** | Visual-only | ✅ Yes | Context cards and pairing status UI use theme tokens |

---

## Problem

Three friction points identified after AB-8:

1. **Repeated pairing prompts** — Extension asks for permission or pairing state too often. User expectation: pair once, trust persists.

2. **No decision context** — The viewer shows intent records but doesn't explain *what* the decision is about. User cannot tell if an "approve" intent refers to a trivial task or a high-risk operation.

3. **No unpaired/pairing UX** — No clear visible state for "not paired," "paired," or "pairing failed."

---

## Scope

### In scope

- **Persistent pairing**
  - One-time pairing flow (auto-discovery or manual)
  - Pairing stored in `chrome.storage.local`
  - Pairing survives extension reload / browser restart
  - Manual revoke/reset button in extension popup
  - Clear visual state: paired / unpaired / pairing error

- **Decision context cards**
  - Read-only context blocks in the Decision Review Viewer
  - Context sourced from audit trail + queue item metadata + custody artifact
  - Fields: prompt summary, work packet title, source URL/app, timestamp, intent type, custody ID, receipt hash, risk class, privacy mode, current queue state
  - Without custody artifact: limited context block showing "intent recorded, custody not linked, integrity incomplete"
  - With custody artifact: full context from Librarian/provenance

- **Empty/degraded state handling**
  - "No decision records" empty state with guidance
  - "Librarian unreachable" degraded state
  - "Custody not linked" per-record state

### Not in scope

- No approval buttons added to context cards
- No queue mutation
- No execution trigger
- No authority transfer
- No direct queue_approve path
- No taskbar/menu-bar surface (AB-10)

---

## Acceptance Criteria

1. Pairing persists across extension reload and browser restart without re-prompt.
2. User can manually revoke/reset pairing from the extension popup.
3. Paired/unpaired state is clearly visible in the extension UI.
4. Decision Review Viewer shows context cards with evidence-based fields.
5. Context cards source data from audit trail + queue + custody — never from extension-side interpretation.
6. Without custody artifact, context card shows limited/incomplete state gracefully.
7. No approval, execution, or authority fields appear in context cards.
8. Pairing status endpoint (or derived state) does not expose human identity.
9. All reads, no writes — queue and custody are unmodified.
10. AB-7 intent path remains the only way to submit decisions from the browser.

---

## Deliverables

- Persistent pairing storage and UI (popup pairing state, revoke/reset)
- Decision context card component in review viewer
- Context data assembly in bridge (`GET /api/decisions` extended or new projection)
- Empty/degraded context states
- Acceptance test: persistent pairing, context shape, no authority fields, no mutation
- AB-9 report

---

## Boundaries to Preserve

```
Pairing → client identity only
Context → evidence explanation only
Review  → read-only visibility only
Intent  → AB-7 path only
Authority → Librarian only
```
