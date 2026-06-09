/**
 * custody-status.ts — Read-only Librarian MCP client for AB-6 status.
 *
 * Queries The Librarian MCP server for custody artifact status.
 * All operations are read-only (R0) — no checkout, no checkin, no writes.
 *
 * If the Librarian server is unreachable, returns null gracefully.
 */

import type { CustodyStatusSummary } from './types.js';

const LIBRARIAN_MCP_URL = 'http://127.0.0.1:3456/mcp';

/**
 * Fetch custody artifact status from The Librarian.
 * Returns null if Librarian is unreachable or returns no results.
 */
export async function fetchCustodyStatus(): Promise<CustodyStatusSummary | null> {
  try {
    // Search for custody artifacts in The Librarian
    const result = await callLibrarian('librarian_search', {
      query: 'evidence_of_intent custody artifact',
      mode: 'keyword',
      limit: 20,
    });

    if (!result) return null;

    // Parse the nested MCP response
    const text = extractTextContent(result);
    if (!text) return null;

    const parsed = JSON.parse(text);
    const results: Array<Record<string, unknown>> = parsed.results ?? [];

    // Also fetch generated docs for recent custody events
    let genDocs: Array<Record<string, unknown>> = [];
    try {
      const genResult = await callLibrarian('librarian_search', {
        query: 'AB-5 Custody Artifact',
        mode: 'keyword',
        limit: 10,
      });
      const genText = extractTextContent(genResult);
      if (genText) {
        const genParsed = JSON.parse(genText);
        genDocs = genParsed.results ?? [];
      }
    } catch {
      // Non-fatal — gen docs are supplementary
    }

    const items = [
      // Map search results to custody items
      ...results.map(mapSearchResult),
      // Map generated doc results
      ...genDocs.map(mapSearchResult),
    ];

    // Deduplicate by a naive approach — just keep the first 10 unique-ish entries
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      const key = item.custodyId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      total: unique.length,
      items: unique.slice(0, 10),
    };
  } catch {
    // Librarian unreachable — graceful degradation
    return null;
  }
}

/**
 * Check whether The Librarian MCP server is reachable.
 */
export async function checkLibrarianHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(LIBRARIAN_MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'ab6-health',
        method: 'tools/list',
        params: {},
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// ── MCP Client ─────────────────────────────────────────────────────

async function callLibrarian(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(LIBRARIAN_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `ab6-${Date.now()}`,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data = await response.json() as Record<string, unknown>;
  const result = data['result'] as Record<string, unknown> | undefined;
  if (!result) return null;

  return result;
}

function extractTextContent(result: unknown): string | null {
  const r = result as Record<string, unknown> | undefined;
  if (!r) return null;

  const content = r['content'] as Array<Record<string, unknown>> | undefined;
  if (!content || content.length === 0) return null;

  const first = content[0];
  if (first?.['type'] !== 'text') return null;

  return (first['text'] as string) ?? null;
}

// ── Result mapping ─────────────────────────────────────────────────

function mapSearchResult(item: Record<string, unknown>): CustodyStatusSummary['items'][0] {
  return {
    custodyId: String(item['id'] ?? item['custody_id'] ?? 'unknown'),
    status: 'evidence_of_intent',
    executionPermission: 'not_granted',
    nextAllowedAction: 'human_review_only',
    sourceQueueItemId: String(item['source_queue_item_id'] ?? item['queue_item_id'] ?? 'unknown'),
    custodyTimestamp: String(item['custody_timestamp'] ?? item['indexed_at'] ?? item['created_at'] ?? ''),
  };
}
