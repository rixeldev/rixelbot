import { createRateLimiter, readPositiveInteger } from "./rateLimiter.js"

export const commandRateLimit = readPositiveInteger(
  process.env.COMMAND_RATE_LIMIT,
  5,
)

export const commandRateWindowMs = readPositiveInteger(
  process.env.COMMAND_RATE_WINDOW_MS,
  10_000,
)

export const commandLimiter = createRateLimiter({
  limit: commandRateLimit,
  windowMs: commandRateWindowMs,
})

/**
 * Limits command usage per user and server. Returns the limiter result so
 * callers can tell the user how long to wait before retrying.
 */
export function checkCommandRateLimit({ guildId, userId }) {
  const scope = guildId || "dm"

  return commandLimiter.consume(`${scope}:${userId}`)
}
