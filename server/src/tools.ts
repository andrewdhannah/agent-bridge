/**
 * agent-bridge — MCP tool definitions.
 *
 * Each tool wraps a queue operation and returns a structured JSON response
 * for the agent to read or act upon.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as queue from "./queue.js";
import type { QueueState } from "./types.js";

/** Default queue directory path. */
const DEFAULT_QUEUE_DIR = process.env['AGENT_BRIDGE_QUEUE_DIR'] ?? '';

function getQueueDir(): string {
  const dir = DEFAULT_QUEUE_DIR;
  if (!dir) {
    throw new Error(
      'AGENT_BRIDGE_QUEUE_DIR is not set. ' +
      'Set it to the absolute path of your queue directory, e.g.:\n' +
      '  export AGENT_BRIDGE_QUEUE_DIR=/Users/andrew/Desktop/OpenWork/agent-bridge/server/queue'
    );
  }
  return dir;
}

/**
 * Register all tools on the MCP server.
 */
export function registerTools(server: McpServer): void {

  // ── queue_status ──────────────────────────────────────────────────
  server.tool(
    'queue_status',
    'Get the current work queue summary. Returns packet counts per state: incoming, approved, in-progress, complete, rejected.',
    {},
    async () => {
      try {
        const s = await queue.summary(getQueueDir());
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(s, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── queue_list ────────────────────────────────────────────────────
  server.tool(
    'queue_list',
    'List all work packets in a given state. Shows packetId, source, threadTitle, and capturedAt for each.',
    {
      state: z.enum(['incoming', 'approved', 'in-progress', 'complete', 'rejected'] as const)
        .describe('Queue state to list'),
    },
    async (params: { state: QueueState }) => {
      try {
        const packets = await queue.list(getQueueDir(), params.state);
        const summary = packets.map(p => ({
          packetId: p.packetId,
          source: p.source,
          threadTitle: p.threadTitle,
          capturedAt: p.capturedAt,
          requiresHumanApproval: p.requiresHumanApproval,
          hasResult: !!p.result,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── queue_inspect ─────────────────────────────────────────────────
  server.tool(
    'queue_inspect',
    'Inspect a full work packet by packetId. Shows all fields including prompt, acceptance criteria, and result.',
    {
      packetId: z.string().describe('The packetId of the work item to inspect'),
    },
    async (params: { packetId: string }) => {
      try {
        const packet = await queue.inspect(getQueueDir(), params.packetId);
        if (!packet) {
          return {
            content: [{ type: 'text' as const, text: `Packet "${params.packetId}" not found.` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(packet, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── queue_approve ─────────────────────────────────────────────────
  server.tool(
    'queue_approve',
    'Approve a work item, moving it from incoming → approved. The agent can then pick it up.',
    {
      packetId: z.string().describe('The packetId of the work item to approve'),
      note: z.string().optional().describe('Optional approval note'),
    },
    async (params: { packetId: string; note?: string }) => {
      try {
        const updated = await queue.transition(getQueueDir(), params.packetId, 'approved');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'approved',
            packetId: updated.packetId,
            state: updated.state,
            note: params.note ?? '',
          }, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── queue_reject ──────────────────────────────────────────────────
  server.tool(
    'queue_reject',
    'Reject a work item, moving it from its current state → rejected with a reason.',
    {
      packetId: z.string().describe('The packetId of the work item to reject'),
      reason: z.string().describe('Why this work item was rejected'),
    },
    async (params: { packetId: string; reason: string }) => {
      try {
        const updated = await queue.transition(getQueueDir(), params.packetId, 'rejected', {
          rejectionReason: params.reason,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'rejected',
            packetId: updated.packetId,
            state: updated.state,
            reason: params.reason,
          }, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── queue_start ───────────────────────────────────────────────────
  server.tool(
    'queue_start',
    'Mark a work item as in-progress, moving it from approved → in-progress. Call this when you begin executing.',
    {
      packetId: z.string().describe('The packetId of the work item to start'),
    },
    async (params: { packetId: string }) => {
      try {
        const updated = await queue.transition(getQueueDir(), params.packetId, 'in-progress');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'in-progress',
            packetId: updated.packetId,
            state: updated.state,
          }, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── queue_complete ────────────────────────────────────────────────
  server.tool(
    'queue_complete',
    'Complete a work item, moving it from in-progress → complete with a result payload. The result will be sent back to the source (e.g. ChatGPT) via the bridge.',
    {
      packetId: z.string().describe('The packetId of the work item to complete'),
      result: z.string().describe('The result payload — summary of what was done, test results, file changes, etc.'),
    },
    async (params: { packetId: string; result: string }) => {
      try {
        const updated = await queue.transition(getQueueDir(), params.packetId, 'complete', {
          result: params.result,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'complete',
            packetId: updated.packetId,
            state: updated.state,
            completedAt: updated.completedAt,
          }, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
