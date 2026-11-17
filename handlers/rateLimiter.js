const defaultMaxKeys = 10_000

/**
 * Creates a fixed-window rate limiter keyed by an arbitrary string.
 * Expired buckets are swept when the map reaches its size limit so that
 * untrusted keys (guild/user IDs) cannot grow memory without bound.
 */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = defaultMaxKeys,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer")
  }

  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new TypeError("windowMs must be a positive integer")
  }

  if (!Number.isInteger(maxKeys) || maxKeys < 1) {
    throw new TypeError("maxKeys must be a positive integer")
  }

  const buckets = new Map()

  function makeRoom() {
    const timestamp = now()

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(key)
    }

    while (buckets.size >= maxKeys) {
      buckets.delete(buckets.keys().next().value)
    }
  }

  return {
    consume(key) {
      const timestamp = now()

      let bucket = buckets.get(key)

      if (bucket?.resetAt <= timestamp) {
        buckets.delete(key)
        bucket = undefined
      }

      if (!bucket) {
        if (buckets.size >= maxKeys) makeRoom()

        bucket = { count: 0, resetAt: timestamp + windowMs }
        buckets.set(key, bucket)
      }

      bucket.count += 1

      if (bucket.count > limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: bucket.resetAt - timestamp,
        }
      }

      return {
        allowed: true,
        remaining: limit - bucket.count,
        retryAfterMs: 0,
      }
    },

    reset() {
      buckets.clear()
    },

    get size() {
      return buckets.size
    },
  }
}

/**
 * Reads a positive integer from the environment, falling back to a default
 * when the value is missing or invalid.
 */
export function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
