/**
 * audit-trail.ts — Structured audit log for decision intents.
 *
 * AB-7: Every submitted decision intent is logged to a JSON-lines file
 * for auditability. The audit trail is append-only and read-only after
 * writing — no edits, no deletes.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { DecisionIntentAuditRecord } from './types.js';

const AUDIT_DIR = resolve(import.meta.dirname ?? '.', '..', 'audit');
const AUDIT_FILE = resolve(AUDIT_DIR, 'decision-intents.jsonl');

/**
 * Append a decision intent audit record to the audit trail.
 * Creates the audit directory if it doesn't exist.
 */
export async function logDecisionIntent(record: DecisionIntentAuditRecord): Promise<void> {
  if (!existsSync(AUDIT_DIR)) {
    await mkdir(AUDIT_DIR, { recursive: true });
  }

  const line = JSON.stringify(record) + '\n';
  await appendFile(AUDIT_FILE, line, 'utf-8');
}

/**
 * Read the last N audit records from the decision intent trail.
 * Returns records newest-first.
 */
export async function readRecentIntents(n: number = 10): Promise<DecisionIntentAuditRecord[]> {
  try {
    const content = await readFile(AUDIT_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const records: DecisionIntentAuditRecord[] = [];

    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as DecisionIntentAuditRecord);
      } catch {
        // skip malformed lines
      }
    }

    // Return newest first
    records.reverse();
    return records.slice(0, n);
  } catch {
    return [];
  }
}

/**
 * Get the path to the audit file (for status display).
 */
export function getAuditPath(): string {
  return AUDIT_FILE;
}
