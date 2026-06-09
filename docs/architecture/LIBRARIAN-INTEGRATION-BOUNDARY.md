# Librarian Integration Boundary

## Core Principles
- **Intake Only:** `agent-bridge` remains an intake bridge, not a decision authority.
- **Custody Layer:** The Librarian remains the sole custody, provenance, and policy layer.
- **No Auto-Execution:** No browser-originated request may execute automatically.
- **Mandatory Approval:** Human approval remains mandatory for all transitions from `incoming` to `approved`.
- **No Auto-Postback:** No automatic postback of results to web AI tools.
- **Full Auditability:** All bridge events must be auditable and persisted to disk.

## Boundary Definition
The boundary between `agent-bridge` and The Librarian is a strict handoff. `agent-bridge` captures and queues; The Librarian (or an agent acting under its policy) approves and executes.
