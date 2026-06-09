# Librarian Integration Boundary

## Core Principles
- **Intake Only:** `agent-bridge` remains an intake bridge, not a decision authority.
- **Custody Layer:** The Librarian remains the sole custody, provenance, and policy layer.
- **No Auto-Execution:** No browser-originated request may execute automatically.
- **Mandatory Approval:** Human approval remains mandatory for all transitions from `incoming` to `approved`.
- **No Auto-Postback:** No automatic postback of results to web AI tools.
- **Full Auditability:** All bridge events must be auditable and persisted to disk.

## Browser Interaction Boundary
The browser window is an intake and review surface, not an execution authority. `agent-bridge` may accept browser-originated requests from an approved extension, but all requests must enter the local queue as `incoming`, require explicit human approval, and remain auditable. The bridge may return results for human review, but it must not automatically post results back into web AI tools or perform browser actions on behalf of the user without a separate, explicit approval model.

### Safe Browser Capabilities (Extension/Bridge)
- Capture selected text.
- Capture page title / source URL.
- Create a queued work packet.
- Show queue status.
- Display local result for human review.
- Optionally copy result to clipboard after human action.

### Forbidden Browser Capabilities
- Drive ChatGPT/Claude UI automatically.
- Inject replies automatically.
- Approve its own packets.
- Scrape entire pages silently.
- Bypass The Librarian’s custody/policy layer.
- Automatic clicking, form submission, or message sending.

## Boundary Definition
The boundary between `agent-bridge` and The Librarian is a strict handoff. `agent-bridge` captures and queues; The Librarian (or an agent acting under its policy) approves and executes.
