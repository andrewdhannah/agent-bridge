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
}
