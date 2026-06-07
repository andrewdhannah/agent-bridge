# Verification Gate

To ensure the integrity of the bridge, every version must pass the 10-step verification gate.

## 🧪 The 10-Step Sequence

| Step | Action | Expected Result |
| :--- | :--- | :--- |
| 1 | `npm run build` | Compiles without errors. |
| 2 | `npm run start` | HTTP server listens on 3457; MCP stdio ready. |
| 3 | Extension Submit | POST `/incoming` returns 201 Created. |
| 4 | File Check | JSON packet exists in `queue/incoming/`. |
| 5 | `queue_approve` | Packet moves to `queue/approved/`. |
| 6 | `queue_start` | Packet moves to `queue/in-progress/`. |
| 7 | `queue_complete` | Packet moves to `queue/complete/` with result. |
| 8 | Result Inspect | `queue_inspect` returns the correct result payload. |
| 9 | Invalid Transition | Attempting `complete` $\rightarrow$ `approved` fails. |
| 10 | Bypass Test | Payload `requiresHumanApproval: false` is ignored. |

## ✅ Acceptance Criteria

A version is labeled **"production-shaped"** only if all 10 steps pass without modification to the core architecture.
