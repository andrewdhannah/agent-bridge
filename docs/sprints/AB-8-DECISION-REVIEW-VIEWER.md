# AB-8 — Decision Review / Decision Record Viewer

**Status:** Planned
**Owner:** OpenWork Agent
**Dependency:** AB-7 (`POST /api/decision-intent`), SEC-1 (`docs/security/`)

---

## Security Inheritance Classification

```
Class A — Authority-touching:           YES — displays decision records and approval status
Class B — Custody/provenance-touching:  YES — displays decision provenance and custody chain
Class C — Privacy/export-touching:      NO
Class D — Advisory/model-touching:      NO
Class E — Visual-only:                  YES — uses shared theme tokens for status badges and review UI

Required inherited controls:
  Class A: No approval path. No queue mutation. No extension authority.
  Class B: Read-only custody display. No custody mutation.
  Class E: No permission encoded in CSS. No authority fields in UI payloads.
  Approval-looking controls must route through AB-7's signed intent path.

SEC-1 impact: full
```

---

## Opening Constraint

AB-8 must display and review decision records without:

- creating a new approval path
- mutating queue state
- bypassing Librarian validation
- exposing unauthorized identity fields
- weakening SEC-1 or SEC-1A inheritance controls

AB-8 is a **viewer/review surface**, not a new authority surface.

---

## Goal

Build a read-only Decision Review / Decision Record Viewer that surfaces custody artifacts, signed decision intents, and their provenance chain for human review — without introducing a new approval path, queue mutation, or authority bypass.

---

## Core Principle

```
AB-7 emits intent.
SEC-1 hardens the path.
AB-8 displays the record.
```

The viewer reads from the existing trust chain. It does not create a new one.

---

## Trust Chain Context

| Sprint | Capability | Direction |
|---|---|---|
| AB-7 | Signed decision intent submission | Extension → Bridge → Librarian |
| SEC-1 | Security, privacy, integrity baseline | System-wide constraint |
| SEC-1A | Cross-project inheritance policy | Connected project governance |
| **AB-8** | **Decision record viewing** | **Librarian → Viewer (read-only)** |

---

## Scope

### In scope

- Read-only display of custody artifacts (custody_id, status, execution_permission, provenance)
- Read-only display of decision intents (intent_id, custody_id, intent_type, timestamp, outcome)
- Read-only display of provenance chain (receipt → custody → decision)
- Status badge rendering using shared `extension/theme/librarian-tokens.css`
- Integration with existing `/api/status` endpoint for data
- Optional: dedicated `/api/decisions` read-only endpoint for structured decision records

### Not in scope

- No approval buttons (no queue_approve, no librarian_record_approval)
- No execute buttons (no queue_start, no queue_complete)
- No queue mutation of any kind
- No custody mutation (no checkout, checkin, generate_doc)
- No human identity fields in viewer payloads
- No browser postback or injection
- No weakening of SEC-1 inheritance controls

---

## Acceptance Criteria

1. Viewer displays custody artifact data without mutating any state.
2. Viewer displays decision intent history without creating a new approval path.
3. Viewer displays provenance chain (receipt → custody → decision).
4. Viewer uses SEC-1 Class E theme tokens for status badges.
5. Viewer never exposes human identity fields.
6. Viewer never exposes agent identity or permission fields.
7. No queue mutation occurs during any viewer operation.
8. No Librarian custody mutation occurs during any viewer operation.
9. Viewer is classified as Class A, B, E under SEC-1 inheritance policy.
10. AB-7 intent path remains the only way to submit decisions from the browser.

---

## Deliverables

- Decision Review viewer (page or component)
- Read-only decision query endpoint (or integration with `/api/status`)
- Status badge rendering with SEC-1 Class E theme tokens
- Provenance chain visualization
- Acceptance test: all reads, no writes, no identity leaks
- AB-8 report

---

## Boundaries to Preserve

```
Decision review → read-only visibility
  ├─ No approval path
  ├─ No execution path
  ├─ No custody mutation path
  ├─ No browser injection path
  ├─ No human identity exposure
  └─ No SEC-1/SEC-1A inheritance bypass
```

AB-8 is the viewer for the trust chain. It does not modify it.
