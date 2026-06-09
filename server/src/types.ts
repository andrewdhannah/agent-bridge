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

// ── AB-7: Decision Intent ──────────────────────────────────────────────

/** Valid decision intent values an extension may submit. */
export type DecisionIntentType = 'approve_requested' | 'reject_requested' | 'defer_requested';

/** Request body for POST /api/decision-intent. */
export interface DecisionIntentRequest {
  /** The custody artifact the human is acting on. */
  custodyId: string;
  /** What the human intends: approve_requested, reject_requested, defer_requested. */
  decisionIntent: DecisionIntentType;
  /** Paired client identifier. */
  clientId: string;
  /** ISO-8601 timestamp of intent creation. */
  timestamp: string;
  /** Unique nonce for replay protection. */
  nonce: string;
  /** SHA-256 hash of the request body (without signature field). */
  bodyHash?: string;
  /** HMAC-SHA256 signature over method + path + timestamp + nonce + bodyHash. */
  signature: string;

  // These are not in the spec but allowed — the handler extracts them
}

/** Extension-safe response from POST /api/decision-intent. */
export interface DecisionIntentResponse {
  /** Whether the intent was accepted by the bridge for forwarding. */
  accepted: boolean;
  /** Human-readable status for the extension UI. */
  extensionVisibleStatus: string;
  /** Always not_granted — the bridge never grants execution. */
  executionPermission: 'not_granted';
  /** What the human should expect next. */
  nextRequiredAction: string;
  /** Optional detail when accepted is false. */
  detail?: string;
}

/** Internal audit record for a decision intent. */
export interface DecisionIntentAuditRecord {
  intentId: string;
  custodyId: string;
  decisionIntent: DecisionIntentType;
  clientId: string;
  timestamp: string;
  nonce: string;
  bodyHash?: string;
  signatureVerified: boolean;
  nonceFresh: boolean;
  librarianSessionActive: boolean;
  accepted: boolean;
  receivedAt: string;
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

// ── AB-8: Decision Review / Decision Record Viewer ───────────────────────

/**
 * A single decision record joining audit trail, custody, and queue provenance.
 *
 * Vocabulary is evidence-based, not authority-based:
 *   intent_status, custody_status, integrity_status — NOT approvalStatus, approvedBy
 */
export interface DecisionRecordItem {
  /** Unique identifier for this decision record. */
  recordId: string;
  /** Timestamp when this record was assembled. */
  reviewedAt: string;

  // ── Intent layer (from AB-7 audit trail) ───────────────────────────
  /** The original intent ID from the audit trail. */
  intentId: string | null;
  /** The custody artifact this intent targeted. */
  custodyId: string | null;
  /** What the human intended: approve_requested | reject_requested | defer_requested. */
  intentType: string | null;
  /** When the intent was submitted. */
  intentTimestamp: string | null;
  /** Status of the intent within the audit trail. */
  intentStatus: string;

  // ── Custody layer (from Librarian) ─────────────────────────────────
  /** Status of the custody artifact (e.g. evidence_of_intent). */
  custodyStatus: string | null;
  /** Execution permission as recorded by Librarian. */
  custodyExecutionPermission: string | null;
  /** When custody was recorded. */
  custodyTimestamp: string | null;

  // ── Queue provenance layer ─────────────────────────────────────────
  /** Source queue item ID linked from custody. */
  sourceQueueItemId: string | null;
  /** Current queue state of the source item. */
  queueState: string | null;
  /** Source of the original work request. */
  queueSource: string | null;
  /** Thread title from the original work request. */
  queueThreadTitle: string | null;

  // ── Context card (AB-9) — evidence-based, not authority-based ──────
  /** Short text summary of the decision context (prompt title/source). */
  contextSummary: string | null;
  /** Which layer provided the context: 'queue' | 'custody' | 'audit' | null. */
  contextSource: string | null;
  /** Risk class from custody artifact, if available. */
  riskClass: string | null;

  // ── Integrity summary ──────────────────────────────────────────────
  /** Overall integrity status: consistent | inconsistent | incomplete. */
  integrityStatus: string;
}

/**
 * Read-only decision review payload returned by GET /api/decisions.
 *
 * This is NOT a decision authority payload. It is an evidence assembly.
 * The extension may inspect this data but never act on it as authority.
 */
export interface DecisionReviewPayload {
  /** Identifies this as a review payload. */
  artifactType: 'decision_review_payload';
  /** Always true — this endpoint never performs mutations. */
  reviewOnly: true;
  /** Always not_granted — the bridge never grants execution. */
  executionPermission: 'not_granted';
  /** The sole authority source for decisions. */
  authoritySource: 'thelibrarian_only';
  /** Human-readable status for the extension UI. */
  extensionVisibleStatus: string;
  /** When this review was generated. */
  generatedAt: string;

  /** Bridge instance identity. */
  bridge: {
    instance: string;
    version: string;
  };

  /** Queue state summary (read-only counts). */
  queueSummary: QueueSummary;

  /** Structured decision records joining intent + custody + provenance. */
  records: DecisionRecordItem[];

  /** Whether the Librarian MCP server is reachable. */
  librarianHealth: 'connected' | 'disconnected' | 'unknown';
}
