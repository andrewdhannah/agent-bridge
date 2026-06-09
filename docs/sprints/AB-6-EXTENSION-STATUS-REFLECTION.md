# AB-6 — Extension Status Reflection

**Status:** Planned
**Owner:** OpenWork Agent
**Dependency:** AB-5b (`docs/architecture/EXTENSION-IDENTITY-BOUNDARY.md`)

---

## Goal

Expose Librarian custody/decision status back to the Chrome extension as **read-only state**, using the extension identity boundary, without allowing approval, execution, browser postback, or custody mutation from the extension.

---

## Core Principle

AB-5b defined **what** the extension identity boundary is. AB-6 implements the **read-only status reflection** that the boundary permits.

From `EXTENSION-IDENTITY-BOUNDARY.md`:

> The Chrome extension **may**: display custody and decision status; display results returned from the local system for human review.

> agent-bridge **may**: expose queue state.

AB-6 makes these `may` items operational.

---

## Trust Chain Context

| Sprint | Layer | Direction |
|---|---|---|
| AB-3 | Receipt generation | Producer → Receiver |
| AB-4 | Receipt validation | Receiver-side check |
| AB-5 | Custody handoff | → Librarian |
| **AB-6** | **Status reflection** | **Librarian → Extension** |

AB-6 is the first **read-only return path** — status from the local system flows back to the browser for human visibility. It does not reverse any previous constraint.

---

## Scope

### In scope

- A read-only status endpoint that the paired Chrome extension can poll or subscribe to.
- Status payload must include:
  - queue state (counts per state: incoming, approved, in-progress, complete, rejected);
  - custody status for active artifacts (custody_id, status, execution_permission, next_allowed_action);
  - recent decisions (decision_id, intent, outcome, timestamp);
  - agent status (active agent, current work);
  - Librarian connection health.
- Response must be signed or delivered over the paired channel (extension must be paired to receive).
- Status is local-state only — no browser postback or injection.

### Not in scope

- No approval from extension (not even as an experiment).
- No execution from extension.
- No bridge state mutation from extension.
- No browser postback or UI driving.
- No custody record mutation from extension.
- No bypass of The Librarian's authority.
- No human identity authentication from extension.

---

## Acceptance Criteria

1. Paired extension receives queue state without authenticating as a human.
2. Paired extension receives custody artifact status without approving anything.
3. Paired extension receives recent decision records without mutating state.
4. Unpaired client cannot access status.
5. No bridge state changes as a result of status reflection.
6. No Librarian custody records change as a result of status reflection.
7. Status is read-only — extension cannot submit intents through the status channel.

---

## Hard Constraints

- The extension **may** see. It **must not** act.
- Status reflection is a **push or poll from Librarian/bridge**, not a browser-side injection.
- The extension identity boundary is not weakened: pairing proves the client, not the human.
- All write operations (approve, reject, start, complete, custody mutate) remain human-gated through the bridge or Librarian directly, not through the extension.

---

## Relationship to AB-5b

| AB-5b (Boundary) | AB-6 (Implementation) |
|---|---|
| Extension may display custody and decision status | Build the status endpoint and data model |
| Extension must not approve or execute | Enforce: status channel has no write path |
| Extension is paired, not logged in | Status accessible by paired clients only |
| agent-bridge may expose queue state | Queue state becomes a structured API response |

---

## Deliverables

- `scripts/extension-status-endpoint.js` or equivalent — read-only status server or bridge extension
- Status JSON schema definition (what the extension receives)
- Acceptance test: paired client receives read-only state; write operations blocked
- Update to `docs/architecture/DATA-FLOW-MATRIX.md` if a new flow is introduced (Librarian → extension via bridge)
- AB-6 report

---

## Key Design Question

**Should status be pushed (Librarian/bridge pushes to extension) or polled (extension polls endpoint)?**

Push is more responsive but requires the extension to have a listener port open.
Poll is simpler but introduces latency and polling overhead.

Recommended direction: **poll from bridge endpoint** — simpler, no new listening surface on the extension, and consistent with the existing bridge HTTP model.

---

## Boundaries to Preserve

```
Status reflection → read-only visibility
  ├─ No approval path
  ├─ No execution path
  ├─ No custody mutation path
  ├─ No browser injection path
  └─ No human credential exposure
```

The extension remains what it has always been: a **paired local client** that improves usability by keeping information near the browser conversation. AB-6 adds visibility without adding authority.
