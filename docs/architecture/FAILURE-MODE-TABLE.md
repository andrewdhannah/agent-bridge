# Failure-Mode Table

## Purpose
To identify potential failure points in the `agent-bridge` and Librarian integration and define the mitigations required to maintain safety and integrity.

| Failure Mode | Impact | Mitigation | Detection |
|---|---|---|---|
| **Server Crash (Bridge)** | Work packets in `in-progress` are orphaned. | Persistent JSON state on disk allows recovery of the last known state. | `queue_status` shows unexpected `in-progress` items. |
| **Packet Corruption** | Agent executes modified/malicious prompt. | SHA-256 hash verification at the moment of execution. | Hash mismatch error during `librarian_checkout`. |
| **Approval Bypass** | Agent starts work without human approval. | Server-side enforcement of state transitions (`incoming` $\rightarrow$ `in-progress` is forbidden). | `queue_start` returns `Invalid transition` error. |
| **Malicious Prompt** | Approved prompt causes local system damage. | The Librarian's policy layer (e.g., Risk 4 / Destructive Ops) blocks the action. | Policy violation error from Librarian. |
| **Port Conflict** | Bridge fails to start. | Standardized port (3457) with clear error messaging and `lsof` cleanup scripts. | `EADDRINUSE` error on startup. |
| **Audit Log Loss** | Loss of provenance for a completed task. | Atomic writes to disk for every state transition. | Missing JSON file for a known `packetId`. |
| **Extension Compromise** | Malicious extension sends fake requests. | All requests enter `incoming` state; human approval is the final gate. | Human review of the prompt before approval. |

## Recovery Protocol
In the event of a critical failure:
1. Stop the bridge server.
2. Inspect the `queue/` directory for orphaned packets.
3. Manually transition orphaned packets to `rejected` or `incoming` for re-evaluation.
4. Restart the server and verify health via `/health`.
