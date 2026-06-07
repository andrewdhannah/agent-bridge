# Design Direction

## 🎯 Core Philosophy

`agent-bridge` is built on the principle of **Explicit Intent**. In an era of autonomous agents, the bridge ensures that the transition from "Web AI suggestion" to "Local System change" is intentional, audited, and approved.

## 🛠️ Design Pillars

### 1. Human-in-the-Loop (HITL)
Automation should not bypass authorization. The bridge enforces a hard stop at the `incoming` state.

### 2. Auditability
Every action is a file system operation. By using plain JSON files, we create a "paper trail" that is:
- Human-readable.
- Version-controllable (via Git).
- Tool-agnostic.

### 3. Local-First Security
The bridge minimizes the attack surface by:
- Restricting the extension to `localhost`.
- Avoiding automatic post-backs to the web.
- Using a pull-based model for agents (agents pick up work from the queue).

## 🚀 Evolution Path

- **V0.1 (Current)**: Basic transport, forced approval, file-based queue.
- **V1.0**: Integration with The Librarian for automated routing and verification.
- **V2.0**: Advanced orchestration, multi-agent handoffs, and optional secure post-back channels.
