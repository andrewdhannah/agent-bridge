#!/usr/bin/env node
/**
 * agent-bridge — Entry point.
 *
 * Starts two servers in one process:
 *   1. MCP server (stdio) — the agent talks to this via OpenWork/OpenCode
 *   2. HTTP server       — the Chrome extension talks to this via localhost
 *
 * Configuration (environment variables):
 *   AGENT_BRIDGE_QUEUE_DIR  — Absolute path to the queue directory (required)
 *   AGENT_BRIDGE_PORT       — HTTP server port (default: 3457)
 *   AGENT_BRIDGE_NAME       — Instance name for health check (default: "agent-bridge")
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { startHttpServer } from "./http-server.js";
import { resolve } from "node:path";

// ── Config from environment ────────────────────────────────────────

const QUEUE_DIR = process.env['AGENT_BRIDGE_QUEUE_DIR'] ?? resolve(import.meta.dirname ?? '', '..', 'queue');
const HTTP_PORT = parseInt(process.env['AGENT_BRIDGE_PORT'] ?? '3457', 10);
const INSTANCE_NAME = process.env['AGENT_BRIDGE_NAME'] ?? 'agent-bridge';
const SKIP_HTTP = process.env['AGENT_BRIDGE_SKIP_HTTP'] === 'true';

// Validate queue dir
if (!QUEUE_DIR) {
  console.error('[agent-bridge] FATAL: AGENT_BRIDGE_QUEUE_DIR is not set and no default queue directory found.');
  process.exit(1);
}

// ── MCP Server ─────────────────────────────────────────────────────

const server = new McpServer({
  name: INSTANCE_NAME,
  version: '0.1.0',
});

registerTools(server);

// ── Start transports ───────────────────────────────────────────────

// 1. MCP stdio transport (agent communication)
const mcpTransport = new StdioServerTransport();
server.connect(mcpTransport).catch((err: unknown) => {
  console.error('[agent-bridge] Fatal: MCP server failed to start:', err);
  process.exit(1);
});

console.error(`[agent-bridge] MCP server ready (queue: ${QUEUE_DIR})`);

// 2. HTTP transport (extension communication)
if (!SKIP_HTTP) {
  startHttpServer({
    httpPort: HTTP_PORT,
    queueDir: QUEUE_DIR,
    instanceName: INSTANCE_NAME,
  });
}

// ── Graceful shutdown ──────────────────────────────────────────────

function shutdown() {
  console.error('[agent-bridge] Shutting down...');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
