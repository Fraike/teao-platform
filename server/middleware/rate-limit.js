// Simple in-memory rate limiter (single-process)

const store = new Map();

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.resetTime > entry.windowMs) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * @param {object} options
 * @param {number} options.windowMs - time window in milliseconds (default 5 min)
 * @param {number} options.maxAttempts - max failed attempts in the window (default 10)
 * @param {string} options.keyPrefix - prefix for the store key (default "rate")
 */
export function createRateLimiter({
  windowMs = 5 * 60 * 1000,
  maxAttempts = 10,
  keyPrefix = "rate",
} = {}) {
  return {
    /**
     * Record a failed attempt. Returns true if rate-limited.
     */
    recordFailure(req) {
      const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
      const now = Date.now();
      let entry = store.get(key);

      if (!entry || now - entry.resetTime > windowMs) {
        entry = { count: 0, resetTime: now + windowMs, windowMs };
      }

      entry.count++;
      store.set(key, entry);

      return entry.count > maxAttempts;
    },

    /**
     * Clear attempts for this requester (call on success).
     */
    clear(req) {
      const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
      store.delete(key);
    },
  };
}
