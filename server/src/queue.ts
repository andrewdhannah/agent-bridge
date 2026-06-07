/**
 * agent-bridge — File-based queue with state machine.
 *
 * Each queue state is a subdirectory:
 *   queue/incoming/     ← extension writes here
 *   queue/approved/     ← moved here on human/auto-approval
 *   queue/in-progress/  ← moved here when agent picks it up
 *   queue/complete/     ← terminal (result attached)
 *   queue/rejected/     ← terminal (reason attached)
 *
 * Packets are JSON files named <packetId>.json for conflict-free writes.
 */

import { readdir, readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkPacket, QueueState, QueueSummary } from './types.js';
import { VALID_TRANSITIONS } from './types.js';

/**
 * Create a new packet and write it to the incoming directory.
 * Returns the assigned packetId.
 */
export async function enqueue(
  queueDir: string,
  source: string,
  threadTitle: string,
  prompt: string,
  overrides?: Partial<WorkPacket>,
): Promise<WorkPacket> {
  // Apply defaults, then overrides, then enforce state-machine invariants
  const packet: WorkPacket = {
    packetId: randomUUID(),
    source,
    threadTitle,
    capturedAt: new Date().toISOString(),
    prompt,
    requiresHumanApproval: true,
    state: 'incoming',
    version: 1,
    ...overrides,
  };
  await ensureDir(queueDir, 'incoming');
  await writeFile(
    pathFor(queueDir, 'incoming', packet.packetId),
    JSON.stringify(packet, null, 2),
    'utf-8',
  );
  return packet;
}

/**
 * Move a packet through the state machine.
 * Returns the updated packet, or throws on invalid transition.
 */
export async function transition(
  queueDir: string,
  packetId: string,
  toState: QueueState,
  meta?: { result?: string; rejectionReason?: string },
): Promise<WorkPacket> {
  // Find the packet in its current state directory
  for (const state of Object.keys(VALID_TRANSITIONS) as QueueState[]) {
    const p = pathFor(queueDir, state, packetId);
    try {
      const raw = await readFile(p, 'utf-8');
      const packet = JSON.parse(raw) as WorkPacket;

      // Validate transition
      const allowed = VALID_TRANSITIONS[packet.state];
      if (!allowed.includes(toState)) {
        throw new Error(
          `Invalid transition: ${packet.state} → ${toState}. ` +
          `Allowed from ${packet.state}: [${allowed.join(', ')}]`,
        );
      }

      // Apply mutation
      const updated: WorkPacket = {
        ...packet,
        state: toState,
        ...(meta?.result !== undefined ? { result: meta.result } : {}),
        ...(meta?.rejectionReason !== undefined ? { rejectionReason: meta.rejectionReason } : {}),
        ...(toState === 'complete' ? { completedAt: new Date().toISOString() } : {}),
      };

      // Write to new location, remove old
      await ensureDir(queueDir, toState);
      await writeFile(
        pathFor(queueDir, toState, packetId),
        JSON.stringify(updated, null, 2),
        'utf-8',
      );
      await unlink(p).catch(() => {}); // best-effort cleanup

      return updated;
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue; // not in this state directory
      }
      throw err;
    }
  }

  throw new Error(`Packet ${packetId} not found in any queue directory`);
}

/**
 * Read a packet by ID, searching all state directories.
 */
export async function inspect(
  queueDir: string,
  packetId: string,
): Promise<WorkPacket | null> {
  for (const state of Object.keys(VALID_TRANSITIONS) as QueueState[]) {
    const p = pathFor(queueDir, state, packetId);
    try {
      const raw = await readFile(p, 'utf-8');
      return JSON.parse(raw) as WorkPacket;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * List all packets in a given state.
 */
export async function list(
  queueDir: string,
  state: QueueState,
): Promise<WorkPacket[]> {
  const dir = join(queueDir, state);
  try {
    const entries = await readdir(dir);
    const packets: WorkPacket[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, entry), 'utf-8');
        packets.push(JSON.parse(raw) as WorkPacket);
      } catch {
        // skip corrupt files
        continue;
      }
    }
    // Sort newest first by capturedAt
    packets.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
    return packets;
  } catch {
    return [];
  }
}

/**
 * Get summary counts for all states.
 */
export async function summary(queueDir: string): Promise<QueueSummary> {
  const states = Object.keys(VALID_TRANSITIONS) as QueueState[];
  const result: Partial<QueueSummary> = {};
  for (const state of states) {
    const dir = join(queueDir, state);
    try {
      const entries = await readdir(dir);
      result[state] = entries.filter(e => e.endsWith('.json')).length;
    } catch {
      result[state] = 0;
    }
  }
  return {
    incoming: result['incoming'] ?? 0,
    approved: result['approved'] ?? 0,
    'in-progress': result['in-progress'] ?? 0,
    complete: result['complete'] ?? 0,
    rejected: result['rejected'] ?? 0,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function pathFor(queueDir: string, state: string, packetId: string): string {
  return resolve(join(queueDir, state, `${packetId}.json`));
}

async function ensureDir(queueDir: string, sub: string): Promise<void> {
  const dir = join(queueDir, sub);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}
