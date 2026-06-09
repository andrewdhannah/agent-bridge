# Audit and Provenance Mapping

## Purpose
To ensure a complete, immutable chain of custody for every request originating from a web AI tool and processed by a local agent.

## 1. Provenance Chain
The following table maps the lifecycle of a work packet and the corresponding audit records.

| Stage | Action | Record Location | Key Metadata Captured |
|---|---|---|---|
| **Capture** | Extension $\rightarrow$ Bridge | `queue/incoming/<id>.json` | `packetId`, `source`, `threadTitle`, `prompt`, `capturedAt` |
| **Approval** | Human $\rightarrow$ `queue_approve` | `queue/approved/<id>.json` | `approvedAt`, `approver`, `approvalNote` |
| **Custody** | Agent $\rightarrow$ Librarian | Librarian Database | `custodyId`, `sha256`, `checkoutTimestamp` |
| **Execution** | Agent $\rightarrow$ Work | Agent Logs / Librarian | `startedAt`, `executionSteps`, `policyChecks` |
| **Completion** | Agent $\rightarrow$ `queue_complete` | `queue/complete/<id>.json` | `result`, `completedAt`, `finalState` |

## 2. Integrity Verification
To prevent "prompt injection" or silent modification between capture and execution:
- **Hash-on-Capture:** The bridge generates a SHA-256 hash of the prompt and context immediately upon receipt.
- **Hash-on-Execution:** The agent verifies the current prompt against the original hash before starting work.
- **Audit Log:** Any attempt to modify a packet after it has entered the `approved` state is flagged as a custody violation.

## 3. Provenance Linkage
Every result produced by the agent must be linked back to the original request:
`Result` $\rightarrow$ `PacketID` $\rightarrow$ `ApprovalRecord` $\rightarrow$ `CaptureRecord` $\rightarrow$ `SourceURL/Thread`.

This linkage allows a human auditor to verify exactly why a specific action was taken and who approved the request.
