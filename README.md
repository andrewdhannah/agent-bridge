# agent-bridge V0.1

`agent-bridge` is a human-in-the-loop bridge between web-based AI tools (like ChatGPT, Claude, etc.) and local agentic environments (like OpenWork/OpenCode). It allows you to capture prompts from your browser and queue them for local execution with an explicit human approval gate.

## 🚀 Overview

When using a web AI, you often want it to perform tasks on your local machine. Instead of copy-pasting prompts or giving a web-AI direct (and risky) access to your system, `agent-bridge` provides a secure, audited pipeline:

**Web AI** $\rightarrow$ **Chrome Extension** $\rightarrow$ **Local Bridge (HTTP)** $\rightarrow$ **Queue (JSON)** $\rightarrow$ **Human Approval (MCP)** $\rightarrow$ **Local Agent**

## ✨ Features

- **Human-in-the-Loop**: Every request is forced into an `incoming` state and requires explicit approval via MCP tools before an agent can start work.
- **Audit Trail**: All state transitions are stored as plain JSON files on disk, providing a permanent record of what was requested and when it was completed.
- **Secure by Design**: The Chrome extension only communicates with `localhost`. The bridge does not automatically post results back to the web, preventing unauthorized data exfiltration.
- **MCP Integration**: Fully compatible with the Model Context Protocol (MCP), allowing agents to manage the queue using standardized tools.

## 🛠️ Quick Start

### 1. Server Setup
```bash
cd server
npm install
npm run build
export AGENT_BRIDGE_QUEUE_DIR="/path/to/your/queue"
npm run start
```

### 2. Extension Setup
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` directory.

### 3. Workflow
1. Capture a prompt using the **Agent Bridge** popup in your browser.
2. Use an MCP-enabled agent to call `queue_list` to see pending work.
3. Call `queue_approve` to move the item to the approved queue.
4. Call `queue_start` to begin execution.
5. Call `queue_complete` to store the final result.

## 📂 Project Structure

- `/server`: TypeScript MCP server and HTTP bridge.
- `/extension`: Chrome Extension (Manifest V3).
- `/docs`: Detailed architecture, governance, and roadmap documentation.

## 📚 Documentation

For detailed guides on architecture, security, and the V1/V2 roadmap, please visit the [Documentation Index](docs/README-DOCS-INDEX.md).

## 📜 License
MIT
