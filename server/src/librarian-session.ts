/**
 * librarian-session.ts — Read-only Librarian session check.
 *
 * AB-7: Verifies that The Librarian MCP server is reachable and has
 * an active session before accepting decision intents.
 *
 * All operations are read-only (R0). No session mutation occurs.
 */

const LIBRARIAN_MCP_URL = 'http://127.0.0.1:3456/mcp';
const HEALTH_TIMEOUT_MS = 3000;

export interface SessionStatus {
  active: boolean;
  reason?: string;
}

/**
 * Check whether The Librarian is reachable and able to process
 * decision intents.
 *
 * Returns { active: true } if Librarian responds to tools/list.
 * Returns { active: false, reason } if unreachable or errored.
 */
export async function checkLibrarianSession(): Promise<SessionStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const response = await fetch(LIBRARIAN_MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'ab7-session-check',
        method: 'tools/list',
        params: {},
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { active: false, reason: `Librarian HTTP ${response.status}` };
    }

    const data = await response.json() as Record<string, unknown>;

    // Check for valid MCP response
    if (data['error']) {
      const err = data['error'] as Record<string, unknown>;
      return { active: false, reason: `Librarian MCP error: ${err['message'] ?? JSON.stringify(err)}` };
    }

    const result = data['result'] as Record<string, unknown> | undefined;
    if (!result || !result['tools']) {
      return { active: false, reason: 'Unexpected Librarian response format' };
    }

    return { active: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { active: false, reason: `Librarian unreachable: ${msg}` };
  }
}
