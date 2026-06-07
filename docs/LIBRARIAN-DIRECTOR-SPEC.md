# Librarian Director Specification

This document formalizes the "Director" model for managing local agentic work initiated from web-based AI tools.

## 🏛️ The Director Model

In this model, `agent-bridge` is not just a transport layer, but the entry point for a managed pipeline where **The Librarian** acts as the Director.

### The Pipeline Flow

1. **Capture**: A Web AI (ChatGPT, Claude, etc.) generates a prompt. The Chrome extension captures this as a `WorkPacket` and POSTs it to the bridge.
2. **Ingestion**: `agent-bridge` writes the packet to `queue/incoming/`.
3. **Direction (The Librarian)**:
   - The Librarian (as an MCP-enabled agent) monitors `queue/incoming/`.
   - The Librarian reviews the prompt, classifies the intent, and determines the required resources (repos, tools, permissions).
   - The Librarian routes the work to the appropriate worker agent.
4. **Human Gate**: The Librarian (or the user) calls `queue_approve` to move the packet to `queue/approved/`.
5. **Execution**: A worker agent picks up the approved packet via `queue_start` and executes the task.
6. **Verification (The Librarian)**:
   - Upon `queue_complete`, The Librarian reviews the result payload.
   - The Librarian verifies the evidence (e.g., checking git diffs, running tests).
7. **Persistence**: The final verified state and the audit trail are preserved in Git.

## 🎯 Goals of the Director Model

- **Separation of Concerns**: The Web AI proposes, The Librarian directs, the Worker executes, and the Human approves.
- **Knowledge Integrity**: The Librarian ensures that work is consistent with the project's canonical state.
- **Reduced Risk**: No worker agent ever starts work without a Director's review and a Human's approval.
