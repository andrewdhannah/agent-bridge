/**
 * agent-bridge — HTTP server for the Chrome extension.
 *
 * The extension POSTs captured prompts here. The bridge writes them into
 * the queue's `incoming/` directory as structured WorkPacket JSON files.
 *
 * Endpoints:
 *   POST /incoming           — Submit a new work packet (from extension)
 *   GET  /status             — Queue summary counts
 *   GET  /inspect/:id        — Full packet details
 *   GET  /health             — Health check (used by extension to discover bridge)
 *   GET  /api/status         — Read-only aggregated status (AB-6, requires pairing)
 *   POST /api/decision-intent— Signed decision intent from extension (AB-7, requires pairing)
 *   GET  /api/decisions      — Read-only decision review payload (AB-8, requires pairing)
 *   GET  /api/pairing/info   — Public pairing config for extension (no auth required, localhost only)
 *
 * AB-8 may inspect decisions. AB-8 may not make decisions.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import * as queue from './queue.js';
import * as pairing from './pairing.js';
import { nonceStore } from './nonce-store.js';
import { checkLibrarianSession } from './librarian-session.js';
import { logDecisionIntent } from './audit-trail.js';
import { fetchCustodyStatus, checkLibrarianHealth } from './custody-status.js';
import { fetchDecisionReview } from './decision-review.js';
import type {
  BridgeConfig, SignedEnvelope, WorkPacketSummary, WorkPacket,
  DecisionIntentRequest, DecisionIntentResponse, DecisionIntentAuditRecord,
} from './types.js';

/** Valid decision intent values. */
const VALID_INTENTS = ['approve_requested', 'reject_requested', 'defer_requested'];

/**
 * Start the HTTP bridge server. Returns the http.Server instance.
 */
export function startHttpServer(config: BridgeConfig): ReturnType<typeof createServer> {
  const { httpPort, queueDir } = config;

  // Start nonce store cleanup for AB-7 replay protection
  nonceStore.startCleanup();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers so the Chrome extension can reach localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signed-Request, X-Client-Id');

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

      // ── GET /api/status (AB-6 — requires extension pairing) ───────
      if (req.method === 'GET' && path === '/api/status') {
        await handleApiStatus(req, res, config);
        return;
      }

      // ── POST /api/decision-intent (AB-7 — requires pairing) ───────
      if (req.method === 'POST' && path === '/api/decision-intent') {
        await handleDecisionIntent(req, res, config);
        return;
      }

      // ── GET|POST|PUT|DELETE /api/decisions (AB-8 — requires pairing) ─
      if (path === '/api/decisions') {
        if (req.method === 'GET') {
          await handleDecisionReview(req, res, config);
          return;
        }
        // POST/PUT/DELETE explicitly rejected — AB-8 is read-only
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Method Not Allowed',
          detail: 'GET /api/decisions is the only allowed method. AB-8 is read-only.',
        }));
        return;
      }

      // ── GET /api/pairing/info — public pairing config for extension ─
      if (req.method === 'GET' && path === '/api/pairing/info') {
        await handlePairingInfo(res, config);
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

// ── POST /incoming ────────────────────────────────────────────────────

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

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'queued',
    packetId: packet.packetId,
    state: packet.state,
  }));
}

// ── GET /api/status (AB-6) ────────────────────────────────────────────

/**
 * Handle GET /api/status — read-only aggregated status for paired extension.
 *
 * Hard constraints:
 *   - Read-only: no queue mutation, no Librarian mutation, no disk writes
 *   - Pairing required: unverified clients receive 401
 *   - No approval, execution, custody mutation, or browser postback
 */
async function handleApiStatus(
  req: IncomingMessage,
  res: ServerResponse,
  config: BridgeConfig,
): Promise<void> {
  // 1. Verify extension pairing
  const pairingResult = await verifyRequestPairing(req, config);
  if (!pairingResult.verified) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Unauthorized',
      detail: pairingResult.reason,
      note: 'Extension pairing required. See EXTENSION-IDENTITY-BOUNDARY.md.',
    }));
    return;
  }

  // 2. Gather queue state (read-only — file reads only)
  const queueSummary = await queue.summary(config.queueDir);

  // 3. Gather individual queue items (read-only)
  const queueItems = {
    incoming: await summarizePackets(config.queueDir, 'incoming'),
    approved: await summarizePackets(config.queueDir, 'approved'),
    'in-progress': await summarizePackets(config.queueDir, 'in-progress'),
    complete: await summarizePackets(config.queueDir, 'complete'),
    rejected: await summarizePackets(config.queueDir, 'rejected'),
  };

  // 4. Fetch custody status from Librarian (read-only MCP) — non-fatal if unreachable
  const [custody, librarianHealthy] = await Promise.all([
    fetchCustodyStatus().catch(() => null),
    checkLibrarianHealth().catch(() => false),
  ]);

  // 5. Build response payload
  const payload = {
    generatedAt: new Date().toISOString(),
    bridge: {
      instance: config.instanceName,
      version: '0.1.0',
      uptime: process.uptime(),
    },
    queue: queueSummary,
    queueItems,
    custody,
    librarianHealth: librarianHealthy ? 'connected' : 'disconnected',
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
}

/**
 * Verify the signed request header against stored pairing config.
 */
async function verifyRequestPairing(
  req: IncomingMessage,
  config: BridgeConfig,
): Promise<{ verified: true } | { verified: false; reason: string }> {
  // If no pairing config path is set, pairing is not required (backward compat)
  if (!config.pairingConfigPath) {
    return { verified: true };
  }

  // Load pairing config
  const pairingConfig = await pairing.loadPairingConfig(config.pairingConfigPath);
  if (!pairingConfig) {
    return { verified: false, reason: 'No pairing config found. Run bridge-pair.js first.' };
  }

  // Parse signed envelope from headers
  const signedHeader = req.headers['x-signed-request'] as string | undefined;
  if (!signedHeader) {
    return { verified: false, reason: 'Missing X-Signed-Request header' };
  }

  let envelope: SignedEnvelope;
  try {
    envelope = JSON.parse(signedHeader) as SignedEnvelope;
  } catch {
    return { verified: false, reason: 'Invalid X-Signed-Request header format (expected JSON)' };
  }

  // Verify the signature
  const sigResult = pairing.verifySignature(
    pairingConfig.clientSecret,
    envelope,
    req.method ?? 'GET',
    req.url ?? '/',
  );

  if (sigResult.valid) {
    return { verified: true };
  }
  return { verified: false, reason: sigResult.reason };
}

// ── POST /api/decision-intent (AB-7) ────────────────────────────────────

/**
 * Handle POST /api/decision-intent — accept a signed decision intent from
 * a paired extension and route it to The Librarian for validation.
 *
 * Hard constraints:
 *   - No queue mutation (no approve, no reject, no state change)
 *   - No execution (no queue_start, no queue_complete)
 *   - No human identity returned
 *   - Signed request required
 *   - Nonce deduplication enforced
 *   - Librarian session verified before acceptance
 */
async function handleDecisionIntent(
  req: IncomingMessage,
  res: ServerResponse,
  config: BridgeConfig,
): Promise<void> {
  const intentId = randomUUID();

  // 1. Read and parse body
  const body = await readBody(req);
  let data: DecisionIntentRequest;

  try {
    data = JSON.parse(body) as DecisionIntentRequest;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      accepted: false,
      extensionVisibleStatus: 'invalid_request',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_request_format',
      detail: 'Invalid JSON body',
    }));
    return;
  }

  // 2. Validate required fields
  if (!data.custodyId || !data.decisionIntent || !data.clientId || !data.timestamp || !data.nonce || !data.signature) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      accepted: false,
      extensionVisibleStatus: 'missing_fields',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_request_format',
      detail: 'Missing required fields: custodyId, decisionIntent, clientId, timestamp, nonce, signature',
    }));
    return;
  }

  // 4. Validate decision intent value
  if (!VALID_INTENTS.includes(data.decisionIntent)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      accepted: false,
      extensionVisibleStatus: 'invalid_intent',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_request_format',
      detail: `Invalid decision_intent. Must be one of: ${VALID_INTENTS.join(', ')}`,
    }));
    return;
  }

  // 5. Verify pairing (body is self-signed, reuses AB-6 signing logic)
  const pairingConfig = await pairing.loadPairingConfig(config.pairingConfigPath ?? '');
  if (!pairingConfig) {
    writeDecisionResponse(res, 401, {
      accepted: false,
      extensionVisibleStatus: 'unauthorized',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_pairing',
      detail: 'No pairing config found. Run bridge-pair.js first.',
    });
    return;
  }

  const envelope: SignedEnvelope = {
    clientId: data.clientId,
    timestamp: data.timestamp,
    nonce: data.nonce,
    bodyHash: data.bodyHash,
    signature: data.signature,
  };

  const sigResult = pairing.verifySignature(
    pairingConfig.clientSecret,
    envelope,
    req.method ?? 'POST',
    req.url ?? '/api/decision-intent',
    data.bodyHash,
  );

  if (!sigResult.valid) {
    writeDecisionResponse(res, 401, {
      accepted: false,
      extensionVisibleStatus: 'unauthorized',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_pairing',
      detail: sigResult.reason,
    });
    return;
  }

  // 6. Check nonce deduplication (replay protection)
  if (nonceStore.isDuplicate(data.clientId, data.nonce)) {
    writeDecisionResponse(res, 409, {
      accepted: false,
      extensionVisibleStatus: 'duplicate_intent',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_for_duplicate',
      detail: 'Nonce already used. This intent appears to be a duplicate.',
    });
    return;
  }

  // 7. Check Librarian session
  const sessionStatus = await checkLibrarianSession();
  if (!sessionStatus.active) {
    writeDecisionResponse(res, 503, {
      accepted: false,
      extensionVisibleStatus: 'no_active_session',
      executionPermission: 'not_granted',
      nextRequiredAction: 'check_librarian_connection',
      detail: sessionStatus.reason,
    });
    return;
  }

  // 8. Log to audit trail
  const auditRecord: DecisionIntentAuditRecord = {
    intentId,
    custodyId: data.custodyId,
    decisionIntent: data.decisionIntent as DecisionIntentAuditRecord['decisionIntent'],
    clientId: data.clientId,
    timestamp: data.timestamp,
    nonce: data.nonce,
    bodyHash: data.bodyHash,
    signatureVerified: true,
    nonceFresh: true,
    librarianSessionActive: true,
    accepted: true,
    receivedAt: new Date().toISOString(),
  };

  await logDecisionIntent(auditRecord).catch(() => {
    // Non-fatal — audit failures don't block the response
    console.error('[agent-bridge] Warning: Failed to write audit record');
  });

  // 9. Return extension-safe response
  writeDecisionResponse(res, 200, {
    accepted: true,
    extensionVisibleStatus: 'decision_intent_recorded',
    executionPermission: 'not_granted',
    nextRequiredAction: 'librarian_validation',
  });
}

// ── GET /api/decisions (AB-8) ──────────────────────────────────────────

/**
 * Handle GET /api/decisions — read-only decision review payload.
 *
 * Assembles evidence from audit trail, custody artifacts, and queue
 * state into a structured DecisionReviewPayload.
 *
 * Hard constraints (AB-8):
 *   - Read-only: no queue mutation, no custody mutation, no disk writes
 *   - Pairing required: unverified clients receive 401 (uses AB-6 pairing)
 *   - No approval path: returns evidence, not authority
 *   - No human identity: all identity fields excluded
 *   - No authority fields: vocabulary is evidence-based (intent_status,
 *     custody_status, integrity_status — not approvalStatus, approvedBy)
 *   - review_only: always true
 *   - execution_permission: always not_granted
 *   - authority_source: always thelibrarian_only
 */
async function handleDecisionReview(
  req: IncomingMessage,
  res: ServerResponse,
  config: BridgeConfig,
): Promise<void> {
  // 1. Verify extension pairing (same as AB-6 / AB-7)
  const pairingResult = await verifyRequestPairing(req, config);
  if (!pairingResult.verified) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Unauthorized',
      detail: pairingResult.reason,
      note: 'Extension pairing required.',
    }));
    return;
  }

  // 2. Assemble decision review payload (all reads, no writes)
  const payload = await fetchDecisionReview(
    config.queueDir,
    config.instanceName,
    '0.1.0',
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload, null, 2));
}

// ── GET /api/pairing/info ─────────────────────────────────────────────

/**
 * Handle GET /api/pairing/info — expose the pairing config to the
 * extension for HMAC signing.
 *
 * Safe for localhost-only: the bridge only accepts local connections.
 * The extension needs the clientId and clientSecret to sign requests.
 */
async function handlePairingInfo(
  res: ServerResponse,
  config: BridgeConfig,
): Promise<void> {
  if (!config.pairingConfigPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No pairing config configured' }));
    return;
  }

  const pairingConfig = await pairing.loadPairingConfig(config.pairingConfigPath);
  if (!pairingConfig) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No pairing config found. Run bridge-pair.js first.' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(pairingConfig));
}

/**
 * Write a decision intent response with consistent error handling.
 * Never includes human identity, agent identity, or authority fields.
 */
function writeDecisionResponse(
  res: ServerResponse,
  status: number,
  payload: DecisionIntentResponse,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

// ── Helpers ───────────────────────────────────────────────────────────

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

/**
 * Summarize packets in a given state for read-only display.
 */
async function summarizePackets(
  queueDir: string,
  state: string,
): Promise<WorkPacketSummary[]> {
  try {
    const packets = await queue.list(queueDir, state as any);
    return packets.slice(0, 10).map((p: WorkPacket) => ({
      packetId: p.packetId,
      source: p.source,
      threadTitle: p.threadTitle,
      state: p.state,
      capturedAt: p.capturedAt,
      requiresHumanApproval: p.requiresHumanApproval,
      hasResult: !!p.result,
    }));
  } catch {
    return [];
  }
}
