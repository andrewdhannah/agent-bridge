/**
 * decision-review.ts — Read-only decision record assembly for AB-8.
 *
 * AB-8 may inspect decisions.
 * AB-8 may not make decisions.
 *
 * This module assembles evidence from the audit trail, custody artifacts,
 * and queue state into a structured DecisionReviewPayload. It performs
 * no mutations of any kind.
 *
 * All operations are read-only (R0). No queue transitions, no custody
 * mutations, no authority resolution.
 */

import { randomUUID } from 'node:crypto';
import * as queue from './queue.js';
import { readRecentIntents } from './audit-trail.js';
import { fetchCustodyStatus, checkLibrarianHealth } from './custody-status.js';
import type {
  DecisionReviewPayload,
  DecisionRecordItem,
  QueueSummary,
} from './types.js';

/**
 * Assemble the read-only decision review payload.
 *
 * Gathers evidence from three sources:
 *   1. Audit trail (AB-7 decision intents)
 *   2. Librarian custody artifacts
 *   3. Bridge queue state
 *
 * All sources are read-only. No writes occur.
 *
 * @param queueDir - Absolute path to the queue directory
 * @param instanceName - Human-readable bridge instance name
 * @param version - Bridge version string
 */
export async function fetchDecisionReview(
  queueDir: string,
  instanceName: string,
  version: string,
): Promise<DecisionReviewPayload> {
  // Gather all evidence sources in parallel (all read-only)
  const [intentRecords, custodyResult, queueSummary, librarianHealthy] = await Promise.all([
    readRecentIntents(50).catch(() => []),
    fetchCustodyStatus().catch(() => null),
    queue.summary(queueDir).catch(() => ({
      incoming: 0, approved: 0, 'in-progress': 0, complete: 0, rejected: 0,
    } as QueueSummary)),
    checkLibrarianHealth().catch(() => false),
  ]);

  // Build a lookup: custodyId → custody item
  const custodyByCustodyId = new Map<string, NonNullable<DecisionReviewPayload['records']>[0]>();
  const custodyItems = custodyResult?.items ?? [];

  // Also build a lookup: sourceQueueItemId → queue packet
  const queuePackets = await fetchAllQueuePackets(queueDir);

  // 1. Create records from intents (each intent becomes a record, linked to custody + queue)
  const records: DecisionRecordItem[] = [];

  for (const intent of intentRecords) {
    // Find matching custody artifact by custodyId
    const matchingCustody = custodyItems.find(
      (c) => c.custodyId === intent.custodyId,
    );

    // Find matching queue packet via custody's sourceQueueItemId
    const sourceId = matchingCustody?.sourceQueueItemId ?? null;
    const matchingPacket = sourceId ? queuePackets.get(sourceId) : null;

    const record: DecisionRecordItem = {
      recordId: randomUUID(),
      reviewedAt: new Date().toISOString(),

      // Intent layer
      intentId: intent.intentId,
      custodyId: intent.custodyId,
      intentType: intent.decisionIntent,
      intentTimestamp: intent.timestamp,
      intentStatus: intent.accepted ? 'recorded' : 'rejected',

      // Custody layer
      custodyStatus: matchingCustody?.status ?? null,
      custodyExecutionPermission: matchingCustody?.executionPermission ?? null,
      custodyTimestamp: matchingCustody?.custodyTimestamp ?? null,

      // Queue provenance layer
      sourceQueueItemId: sourceId,
      queueState: matchingPacket?.state ?? null,
      queueSource: matchingPacket?.source ?? null,
      queueThreadTitle: matchingPacket?.threadTitle ?? null,

      // Integrity summary
      integrityStatus: computeIntegrityStatus(intent.accepted, !!matchingCustody, !!matchingPacket),
    };

    records.push(record);
  }

  // 2. Add custody-only records (custody artifacts with no matching intent)
  for (const custody of custodyItems) {
    const hasMatchingIntent = intentRecords.some(
      (i) => i.custodyId === custody.custodyId,
    );
    if (hasMatchingIntent) continue;

    const sourceId = custody.sourceQueueItemId ?? null;
    const matchingPacket = sourceId ? queuePackets.get(sourceId) : null;

    records.push({
      recordId: randomUUID(),
      reviewedAt: new Date().toISOString(),

      intentId: null,
      custodyId: custody.custodyId,
      intentType: null,
      intentTimestamp: null,
      intentStatus: 'no_intent_recorded',

      custodyStatus: custody.status,
      custodyExecutionPermission: custody.executionPermission,
      custodyTimestamp: custody.custodyTimestamp,

      sourceQueueItemId: sourceId,
      queueState: matchingPacket?.state ?? null,
      queueSource: matchingPacket?.source ?? null,
      queueThreadTitle: matchingPacket?.threadTitle ?? null,

      integrityStatus: 'incomplete',
    });
  }

  // Sort: newest first by intentTimestamp, then custodyTimestamp
  records.sort((a, b) => {
    const aTs = a.intentTimestamp ?? a.custodyTimestamp ?? '';
    const bTs = b.intentTimestamp ?? b.custodyTimestamp ?? '';
    return bTs.localeCompare(aTs);
  });

  // Determine overall visibility status
  const extensionVisibleStatus = computeExtensionStatus(librarianHealthy, records.length);

  return {
    artifactType: 'decision_review_payload',
    reviewOnly: true,
    executionPermission: 'not_granted',
    authoritySource: 'thelibrarian_only',
    extensionVisibleStatus,
    generatedAt: new Date().toISOString(),

    bridge: {
      instance: instanceName,
      version,
    },

    queueSummary,
    records: records.slice(0, 50), // cap at 50 records

    librarianHealth: librarianHealthy ? 'connected' : 'disconnected',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Compute overall extension-visible review status.
 * Uses evidence-based vocabulary only.
 */
function computeExtensionStatus(
  librarianHealthy: boolean,
  recordCount: number,
): string {
  if (!librarianHealthy) return 'librarian_unreachable';
  if (recordCount === 0) return 'no_records_available';
  return 'review_ready';
}

/**
 * Compute integrity status for a record based on available evidence.
 *
 * consistent     — all three layers (intent, custody, queue) are present
 * inconsistent   — intent and custody present but disagree
 * incomplete     — one or more layers missing
 */
function computeIntegrityStatus(
  intentAccepted: boolean,
  hasCustody: boolean,
  hasQueue: boolean,
): string {
  if (intentAccepted && hasCustody && hasQueue) return 'consistent';
  if (intentAccepted && hasCustody && !hasQueue) return 'incomplete';
  if (intentAccepted && !hasCustody) return 'incomplete';
  if (!intentAccepted) return 'incomplete';
  return 'incomplete';
}

/**
 * Fetch all queue packets across all states for provenance lookup.
 */
async function fetchAllQueuePackets(
  queueDir: string,
): Promise<Map<string, { state: string; source: string; threadTitle: string }>> {
  const states = ['incoming', 'approved', 'in-progress', 'complete', 'rejected'] as const;
  const packetMap = new Map<string, { state: string; source: string; threadTitle: string }>();

  for (const state of states) {
    try {
      const packets = await queue.list(queueDir, state);
      for (const p of packets) {
        packetMap.set(p.packetId, {
          state: p.state,
          source: p.source,
          threadTitle: p.threadTitle,
        });
      }
    } catch {
      // Non-fatal — skip unreachable state directories
    }
  }

  return packetMap;
}
