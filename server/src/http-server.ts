/**
 * agent-bridge — HTTP server for the Chrome extension.
 *
 * The extension POSTs captured prompts here. The bridge writes them into
 * the queue's `incoming/` directory as structured WorkPacket JSON files.
 *
 * Endpoints:
 *   POST /incoming    — Submit a new work packet (from extension)
 *   GET  /status      — Queue summary counts
 *   GET  /inspect/:id — Full packet details
 *   GET  /health      — Health check (used by extension to discover bridge)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import * as queue from './queue.js';
import type { BridgeConfig } from './types.js';

/**
 * Start the HTTP bridge server. Returns the http.Server instance.
 */
export function startHttpServer(config: BridgeConfig): ReturnType<typeof createServer> {
  const { httpPort, queueDir } = config;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers so the Chrome extension can reach localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? '/', `http://localhost:${httpPort}`);
      const path = url.pathname;

      // ── POST /incoming ────────────────────────────────────────────
      if (req.method === 'POST' && path === '/incoming') {
        await handleIncoming(req, res, queueDir);
        return;
      }

      // ── GET /status ───────────────────────────────────────────────
      if (req.method === 'GET' && path === '/status') {
        const s = await queue.summary(queueDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(s));
        return;
      }

      // ── GET /inspect/:id ──────────────────────────────────────────
      const inspectMatch = path.match(/^\/inspect\/(.+)$/);
      if (req.method === 'GET' && inspectMatch) {
        const packetId = inspectMatch[1]!;
        const packet = await queue.inspect(queueDir, packetId);
        if (!packet) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(packet));
        return;
      }

      // ── GET /health ───────────────────────────────────────────────
      if (req.method === 'GET' && path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          instance: config.instanceName,
          queueDir,
          uptime: process.uptime(),
        }));
        return;
      }

      // ── 404 fallback ──────────────────────────────────────────────
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', path }));

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
  });

  server.listen(httpPort, () => {
    console.error(`[agent-bridge:http] Listening on http://127.0.0.1:${httpPort}`);
  });

  return server;
}

/**
 * Handle POST /incoming — parse JSON body and enqueue a work packet.
 */
async function handleIncoming(
  req: IncomingMessage,
  res: ServerResponse,
  queueDir: string,
): Promise<void> {
  const body = await readBody(req);
  let data: Record<string, unknown>;

  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const source = typeof data['source'] === 'string' ? data['source'] : 'chatgpt';
  const threadTitle = typeof data['threadTitle'] === 'string' ? data['threadTitle'] : 'Untitled';
  const prompt = typeof data['prompt'] === 'string' ? data['prompt'] : '';

  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Field "prompt" is required' }));
    return;
  }

  // Optional structured fields
  const allowedFiles = Array.isArray(data['allowedFiles']) ? data['allowedFiles'] as string[] : [];
  const forbiddenActions = Array.isArray(data['forbiddenActions']) ? data['forbiddenActions'] as string[] : [];
  const acceptanceCriteria = Array.isArray(data['acceptanceCriteria']) ? data['acceptanceCriteria'] as string[] : [];
  // requiresHumanApproval is forced to true — web payload cannot disable it
  const requiresHumanApproval = true;
  const repo = typeof data['repo'] === 'string' ? data['repo'] : undefined;

  const packet = await queue.enqueue(queueDir, source, threadTitle, prompt, {
    repo,
    allowedFiles,
    forbiddenActions,
    acceptanceCriteria,
    requiresHumanApproval,
  });

  const inspectUrl = `http://127.0.0.1:${(new URL(`http://localhost:0`)).port}/inspect/${packet.packetId}`;

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'queued',
    packetId: packet.packetId,
    state: packet.state,
    inspectUrl,
  }));
}

/**
 * Read the full request body as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
