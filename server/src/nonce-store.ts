/**
 * nonce-store.ts — In-memory nonce deduplication with TTL.
 *
 * AB-7: Prevents replay attacks by tracking used nonces.
 * Nonces expire after 10 minutes and are pruned on access.
 *
 * Thread-safe for single-process Node.js usage.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // prune every 5 minutes

interface NonceEntry {
  nonce: string;
  clientId: string;
  seenAt: number;
}

export class NonceStore {
  private store = new Map<string, NonceEntry>();
  private ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs?: number) {
    this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Start periodic cleanup of expired nonces.
   * Call during server startup.
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.prune(), CLEANUP_INTERVAL_MS);
    // Allow process to exit even if timer is active
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Check if a nonce has been seen before.
   * Returns true if the nonce is already in the store (duplicate/replay).
   * Returns false if the nonce is new (first use).
   *
   * On first use, the nonce is stored with the current timestamp.
   */
  isDuplicate(clientId: string, nonce: string): boolean {
    const key = this.makeKey(clientId, nonce);

    if (this.store.has(key)) {
      return true; // replay detected
    }

    // Store the nonce
    this.store.set(key, {
      nonce,
      clientId,
      seenAt: Date.now(),
    });

    return false;
  }

  /**
   * Remove expired nonces from the store.
   */
  prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, entry] of this.store.entries()) {
      if (entry.seenAt < cutoff) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get the current size of the nonce store.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all stored nonces.
   */
  clear(): void {
    this.store.clear();
  }

  private makeKey(clientId: string, nonce: string): string {
    return `${clientId}::${nonce}`;
  }
}

/** Singleton instance for the bridge server. */
export const nonceStore = new NonceStore();
