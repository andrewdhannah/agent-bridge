# Security and Trust Model

`agent-bridge` is designed to operate in a "Zero Trust" environment regarding web-based AI inputs.

## 🛡️ Trust Boundaries

### 1. The Web Boundary
We assume all input from the Chrome extension is untrusted. 
- **No Direct Execution**: No prompt is ever executed immediately.
- **Forced Approval**: The `requiresHumanApproval` flag is enforced by the server, not the client.

### 2. The Local Boundary
The bridge operates entirely on `localhost`.
- **No External Inbound**: The HTTP server only accepts connections from the local machine.
- **No External Outbound**: The bridge does not send data back to the web AI.

### 3. The Agent Boundary
Agents interact with the bridge via MCP tools.
- **State Constraints**: Agents cannot move packets backward in the state machine.
- **Auditability**: Every transition is recorded as a file move, making it impossible for an agent to "hide" its tracks.

## 🔐 Data Custody
The user maintains full custody of the queue directory. Since the queue is plain JSON, the user can audit, delete, or modify packets using any standard text editor.
