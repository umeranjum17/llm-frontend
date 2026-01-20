/**
 * Simple mutex implementation for coordinating critical operations.
 * Prevents concurrent cache clearing, service worker updates, etc.
 */

type ReleaseFunction = () => void;

class OperationMutex {
  private locks = new Map<string, Promise<void>>();
  private resolvers = new Map<string, ReleaseFunction>();

  /**
   * Acquire a lock for the given key. Returns a release function.
   * If the lock is already held, waits until it's released.
   */
  async acquire(key: string): Promise<ReleaseFunction> {
    // Wait for any existing lock to release
    while (this.locks.has(key)) {
      try {
        await this.locks.get(key);
      } catch {
        // Ignore errors from previous lock holder
      }
    }

    // Create new lock
    let release: ReleaseFunction;
    const lockPromise = new Promise<void>((resolve) => {
      release = () => {
        this.locks.delete(key);
        this.resolvers.delete(key);
        resolve();
      };
    });

    this.locks.set(key, lockPromise);
    this.resolvers.set(key, release!);

    return release!;
  }

  /**
   * Execute an operation while holding a lock.
   * Lock is automatically released when operation completes (success or error).
   */
  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire(key);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * Try to acquire a lock without waiting.
   * Returns release function if successful, null if lock is already held.
   */
  tryAcquire(key: string): ReleaseFunction | null {
    if (this.locks.has(key)) {
      return null;
    }

    let release: ReleaseFunction;
    const lockPromise = new Promise<void>((resolve) => {
      release = () => {
        this.locks.delete(key);
        this.resolvers.delete(key);
        resolve();
      };
    });

    this.locks.set(key, lockPromise);
    this.resolvers.set(key, release!);

    return release!;
  }

  /**
   * Check if a lock is currently held
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Force release a lock (use with caution - for error recovery only)
   */
  forceRelease(key: string): void {
    const resolver = this.resolvers.get(key);
    if (resolver) {
      resolver();
    }
  }
}

// Singleton instance
export const operationMutex = new OperationMutex();

/**
 * Common lock keys for the application
 */
export const LockKeys = {
  /** Lock for cache clearing operations */
  CACHE_CLEAR: "cache_clear",
  /** Lock for service worker update operations */
  SERVICE_WORKER_UPDATE: "sw_update",
  /** Lock for database health check operations */
  DB_HEALTH_CHECK: "db_health_check",
} as const;

export type LockKey = (typeof LockKeys)[keyof typeof LockKeys];
