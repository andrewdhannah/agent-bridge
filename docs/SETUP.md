# Setup Guide

## Prerequisites

- **Node.js**: v18 or higher.
- **Chrome Browser**: For the extension.
- **MCP Client**: An agent capable of running MCP servers (e.g., OpenWork, Claude Desktop).

## Server Installation

1. **Clone and Install**:
   ```bash
   git clone <repo-url>
   cd agent-bridge/server
   npm install
   ```

2. **Build**:
   ```bash
   npm run build
   ```

3. **Configure Environment**:
   You must specify where the queue files will be stored.
   ```bash
   export AGENT_BRIDGE_QUEUE_DIR="/Users/yourname/agent-bridge-queue"
   mkdir -p "$AGENT_BRIDGE_QUEUE_DIR"
   ```

4. **Run**:
   ```bash
   npm run start
   ```

## Extension Installation

1. Open Chrome and go to `chrome://extensions`.
2. Toggle **Developer mode** on.
3. Click **Load unpacked**.
4. Select the `/Users/andrew/Desktop/OpenWork/agent-bridge/extension` folder.

## Testing the Setup

1. Click the extension icon and send a test prompt.
2. Check the `incoming` folder in your `AGENT_BRIDGE_QUEUE_DIR`.
3. Use your MCP agent to call `queue_status` to verify the packet was received.
