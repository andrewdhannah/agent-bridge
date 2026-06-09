# SEC-1 Inheritance — agent-bridge

## Classification

| Class | Category | Applied? | Notes |
|---|---|---|---|
| **A** | Authority-touching | ✅ Yes | Queue state machine, approval/reject tools, decision intent transport |
| **B** | Custody/provenance-touching | ✅ Yes | Receipt generation, custody handoff, integrity hashes |
| **C** | Privacy/export-touching | ✅ Yes | Diagnostic data, prompt content in queue, audit trail |
| **E** | Visual-only | ✅ Yes | Extension theme tokens, status badge styling, button classes |

## Inherited Controls

### Class A — Authority

| Control | Status | Evidence |
|---|---|---|
| Human validation | ✅ Enforced | `requiresHumanApproval` forced true; queue_approve requires MCP tool call |
| No auto-approval | ✅ Enforced | No automated approval path; all intents require Librarian validation |
| No bridge authority | ✅ Enforced | Bridge transports intent; does not record authoritative decisions |
| No extension authority | ✅ Enforced | Extension submits signed intents only; never receives authority fields |
| Audit log | ✅ Enforced | `audit/decision-intents.jsonl` — append-only JSON-lines |
| Replay protection | ✅ Enforced | HMAC-SHA256 signature verification, nonce dedup, 5-min timestamp window |
| Session validation | ✅ Enforced | `/api/decision-intent` checks Librarian session before accepting intent |
| Fail closed | ✅ Enforced | Missing/expired/duplicate/unsigned intents return non-200 error |

### Class B — Custody/Provenance

| Control | Status | Evidence |
|---|---|---|
| Hash verification | ✅ Enforced | AB-4 validator checks SHA-256 format; AB-5 generates custody hashes |
| Source provenance | ✅ Enforced | Custody artifacts link back to receipt file, bridge state file, source hash |
| Append-only mutation model | ✅ Enforced | Audit trail is append-only JSON-lines; queue is state-machine with file moves |
| Tamper detection | 🔍 Documented | SEC-1 fixtures cover tamper scenarios; hash recomputed on read |
| Custody ID | ✅ Enforced | Every custody artifact has a UUID custody_id |
| Evidence-of-intent marker | ✅ Enforced | Custody artifacts carry `status: evidence_of_intent` and `execution_permission: not_granted` |

### Class C — Privacy/Export

| Control | Status | Evidence |
|---|---|---|
| Privacy mode enforcement | 🔍 Planned | Privacy pipeline exists in TheLibrarian; bridge respects local-only default |
| Data minimization | ✅ Enforced | Queue captures only prompt, source URL, thread title. No silent scraping. |
| No unnecessary personal data | ✅ Enforced | No credentials, no browsing history, no contacts |

### Class E — Visual

| Control | Status | Evidence |
|---|---|---|
| Visual styling cannot imply authority | ✅ Enforced | `extension/theme/librarian-tokens.css` — tokens are visual only |
| No permission encoded in CSS | ✅ Enforced | CSS contains no permission logic, no authority rules |
| No authority fields in UI payloads | ✅ Enforced | `/api/status` and `/api/decision-intent` responses exclude human identity and permission fields |
| Approval-looking controls route through intent path | ✅ Enforced | `librarian-btn--approve` submits signed decision intent; never triggers direct approval |
