# Implementation Guide

This guide provides technical details for deploying and configuring the `agent-bridge`.

## 🛠️ Server Deployment

The server is a Node.js application using TypeScript.

### Build Process
The project uses `tsc` for compilation.
```bash
npm run build
```
This generates the `dist/` directory containing the ESM output.

### Runtime Configuration
The server relies on three primary environment variables:
- `AGENT_BRIDGE_QUEUE_DIR`: Absolute path to the directory where JSON packets are stored.
- `AGENT_BRIDGE_PORT`: The port for the HTTP bridge (default: 3457).
- `AGENT_BRIDGE_NAME`: Identifier for the instance (default: "agent-bridge").

## 🌐 Extension Deployment

The extension is a Manifest V3 Chrome extension.

### Installation
1. Load the `extension/` folder via `chrome://extensions` $\rightarrow$ **Load unpacked**.
2. Ensure the `host_permissions` in `manifest.json` match the server's port.

## 🔌 MCP Integration

To integrate with an MCP client (like OpenWork):
1. Add the server to your MCP configuration.
2. Command: `node /path/to/agent-bridge/server/dist/index.js`
3. Environment: Ensure `AGENT_BRIDGE_QUEUE_DIR` is passed to the process.
