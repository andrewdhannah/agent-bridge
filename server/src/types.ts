/**
 * agent-bridge — Shared type definitions.
 *
 * A WorkPacket is a structured work item flowing through the queue:
 *   incoming → approved → in-progress → complete | rejected
 */

/** Valid queue states a packet can be in. */
export type QueueState = 'incoming' | 'approved' | 'in-progress' | 'complete' | 'rejected';

/** All possible queue state transitions. */
export const VALID_TRANSITIONS: Record<QueueState, QueueState[]> = {
  'incoming':     ['approved', 'rejected'],
  'approved':     ['in-progress', 'rejected'],
  'in-progress':  ['complete', 'rejected'],
  'complete':     [],       // terminal
  'rejected':     [],       // terminal
};

/** The structured work item that flows through the queue. */
export interface WorkPacket {
  /** Unique identifier (UUID v4). */
  packetId: string;
  /** Origin web app, e.g. "chatgpt", "claude.ai", "custom". */
  source: string;
  /** Title/context of the source thread. */
  threadTitle: string;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  /** The actual prompt / work description. */
  prompt: string;
  /** Explicit acceptance criteria, if any. */
  acceptanceCriteria?: string[];
  /** If true, the agent must wait for manual approval before executing. */
  requiresHumanApproval: boolean;
  /** Current queue position. */
  state: QueueState;
  /** Result payload (written when state → complete). */
  result?: string;
  /** Reason (written when state → rejected). */
  rejectionReason?: string;
  /** ISO-8601 completion timestamp. */
  completedAt?: string;
  /** Packet version for future schema migrations. */
  version: 1;
  /** Target project/repo hint (optional — for the agent's benefit). */
  repo?: string;
  /** Files the agent is allowed to touch (empty = no restriction). */
  allowedFiles?: string[];
  /** Actions the agent must NOT perform. */
  forbiddenActions?: string[];
}

/** Summary counts for queue status. */
export interface QueueSummary {
  incoming: number;
  approved: number;
  'in-progress': number;
  complete: number;
  rejected: number;
}

/** The bridge HTTP server configuration. */
export interface BridgeConfig {
  /** Port for the HTTP endpoint (extension → bridge). Default 3457. */
  httpPort: number;
  /** Absolute path to the queue directory. */
  queueDir: string;
  /** Human-readable name for this bridge instance. */
  instanceName: string;
  /** Optional path to pairing config file for extension identity. */
  pairingConfigPath?: string;
}

// ── Extension Identity (AB-5b / AB-6) ──────────────────────────────────

/** Configuration for a paired extension client. */
export interface PairingConfig {
  /** Unique client ID (e.g. "chrome-extension-local-1"). */
  clientId: string;
  /** Shared HMAC secret (hex-encoded). */
  clientSecret: string;
  /** When this pairing was created. */
  pairedAt: string;
  /** Human-readable label for this client. */
  label?: string;
}

/** Signed request envelope from a paired extension. */
export interface SignedEnvelope {
  clientId: string;
  timestamp: string;
  nonce: string;
  bodyHash?: string;
  signature: string;
}

/** Aggregated read-only status payload returned by GET /api/status. */
export interface StatusPayload {
  /** Timestamp of status generation. */
  generatedAt: string;
  /** Bridge instance identity. */
  bridge: {
    instance: string;
    version: string;
    uptime: number;
  };
  /** Queue state counts per state. */
  queue: QueueSummary;
  /** Individual queue item details (last 10 per state). */
  queueItems: {
    incoming: Array<WorkPacketSummary>;
    approved: Array<WorkPacketSummary>;
    'in-progress': Array<WorkPacketSummary>;
    complete: Array<WorkPacketSummary>;
    rejected: Array<WorkPacketSummary>;
  };
  /** Read-only custody artifact status from The Librarian. */
  custody: CustodyStatusSummary | null;
  /** Whether the Librarian MCP server is reachable. */
  librarianHealth: 'connected' | 'disconnected';
}

/** Minimal packet fields exposed in read-only status. */
export interface WorkPacketSummary {
  packetId: string;
  source: string;
  threadTitle: string;
  state: string;
  capturedAt: string;
  requiresHumanApproval: boolean;
  hasResult: boolean;
}

/** Summary of custody artifacts as seen by the bridge. */
export interface CustodyStatusSummary {
  /** Number of custody artifacts found. */
  total: number;
  /** Recent custody items (max 10). */
  items: Array<{
    custodyId: string;
    status: string;
    executionPermission: string;
    nextAllowedAction: string;
    sourceQueueItemId: string;
    custodyTimestamp: string;
  }>;
}
