# Architecture Reference

`agent-bridge` implements a strict state machine to ensure that no local action is taken without human oversight.

## 🔄 The State Machine

Work items (WorkPackets) flow through the following states:

| State | Description | Transition To |
| :--- | :--- | :--- |
| `incoming` | Packet received via HTTP POST from extension. | `approved`, `rejected` |
| `approved` | Human has reviewed and approved the work. | `in-progress`, `rejected` |
| `in-progress` | Local agent has picked up the work and is executing. | `complete`, `rejected` |
| `complete` | Work finished. Result payload is attached. | (Terminal) |
| `rejected` | Work declined. Rejection reason is attached. | (Terminal) |

## 🛡️ Security Model

### 1. Forced Approval
The HTTP server explicitly ignores any `requiresHumanApproval: false` flags sent in the web payload. All packets are initialized with `requiresHumanApproval: true`.

### 2. Local-Only Communication
The Chrome extension is restricted to `http://127.0.0.1:3457`. It cannot send data to any external server.

### 3. File-Based Persistence
By using plain JSON files in a directory structure, the bridge avoids the need for a complex database and ensures that the queue can be inspected, backed up, or manually edited by the user.

## 🛠️ MCP Toolset

The bridge exposes the following tools to the agent:

- `queue_status`: Summary of counts per state.
- `queue_list`: List of packets in a specific state.
- `queue_inspect`: Full details of a specific packet.
- `queue_approve`: `incoming` $\rightarrow$ `approved`.
- `queue_reject`: Any $\rightarrow$ `rejected`.
- `queue_start`: `approved` $\rightarrow$ `in-progress`.
- `queue_complete`: `in-progress` $\rightarrow$ `complete`.
