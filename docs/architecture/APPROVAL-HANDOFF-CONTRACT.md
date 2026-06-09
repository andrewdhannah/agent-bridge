# Approval Handoff Contract

## Purpose
This contract defines the formal handoff between the `agent-bridge` intake system and The Librarian's execution and custody layer. It ensures that no work is performed without explicit human approval and that the transition of authority is auditable.

## 1. The Handoff Trigger
The handoff is triggered exclusively by the `queue_approve` tool call.
- **Actor:** Human User.
- **Action:** Transition a work packet from `incoming` $\rightarrow$ `approved`.
- **Requirement:** The human must have reviewed the `prompt` and `context` captured by the bridge.

## 2. Handoff Sequence
1. **Approval:** Human calls `queue_approve(packetId)`.
2. **State Change:** `agent-bridge` updates the packet state to `approved` and records the timestamp.
3. **Notification:** The local agent (acting as the bridge operator) is notified that a packet is ready for execution.
4. **Custody Transfer:** The agent calls `librarian_checkout(packetId)` (or equivalent) to bring the packet under The Librarian's custody.
5. **Execution Start:** The agent calls `queue_start(packetId)`, moving the state to `in-progress`.

## 3. Authority and Permission
- **The Bridge's Role:** The bridge provides the *request* (what the user wants).
- **The Librarian's Role:** The Librarian provides the *permission* (what is allowed based on policy).
- **Constraint:** Even if a packet is `approved` in the bridge, The Librarian may still block execution if the request violates a core safety policy (e.g., destructive operations without higher-level authorization).

## 4. Integrity Guarantee
Before any work is performed on an approved packet:
- The agent must verify the packet's content against the hash recorded at the time of capture.
- Any modification to the prompt after approval requires a return to the `incoming` state for re-approval.

## 5. Completion and Return
Upon completion:
- The agent calls `queue_complete(packetId, result)`.
- The result is written to the bridge's `complete/` directory.
- The Librarian records the provenance of the result, linking it back to the original approved packet.
