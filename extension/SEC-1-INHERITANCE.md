# SEC-1 Inheritance — Browser Extension

## Classification

| Class | Category | Applied? | Notes |
|---|---|---|---|
| **A** | Authority-touching | ✅ Yes | Submits signed decision intents; must never approve directly |
| **B** | Custody/provenance-touching | ✅ Yes | Reads custody status via `/api/status`; never mutates custody |
| **C** | Privacy/export-touching | ✅ Yes | Displays queue data; may show diagnostic information |
| **E** | Visual-only | ✅ Yes | Uses `librarian-tokens.css` for visual consistency |

## Inherited Controls

### Class A — Authority

| Control | Status | Evidence |
|---|---|---|
| No extension authority | ✅ Enforced | Extension sends signed intents only; bridge rejects any non-intent write |
| Human validation | ✅ Enforced | All intents require Librarian session validation; extension cannot bypass |
| No auto-approval | ✅ Enforced | No approval path exists in extension code |
| Audit log | ✅ Enforced | Intents are logged by bridge; extension has no independent audit |
| Replay protection | ✅ Enforced | Intents are signed, nonced, timestamped; bridge enforces freshness |
| Fail closed | ✅ Enforced | Unverified intents receive 401/409; extension cannot proceed |

### Class B — Custody/Provenance

| Control | Status | Evidence |
|---|---|---|
| Read-only custody access | ✅ Enforced | Extension polls `/api/status` for custody status; no custody write path |
| No custody mutation | ✅ Enforced | Extension never calls checkout, checkin, or generate_doc |

### Class C — Privacy/Export

| Control | Status | Evidence |
|---|---|---|
| No unnecessary personal data | ✅ Enforced | Extension captures only prompt, source URL, thread title |
| Data minimization | ✅ Enforced | No browsing history, no credentials, no contacts |

### Class E — Visual

| Control | Status | Evidence |
|---|---|---|
| Visual styling cannot imply authority | ✅ Enforced | Theme tokens are visual affordances only |
| No permission encoded in CSS | ✅ Enforced | `librarian-tokens.css` contains no logic or authority rules |
| Approval-looking controls route through intent path | ✅ Enforced | Every approve/reject button emits a signed decision intent |
