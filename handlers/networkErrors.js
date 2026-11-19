const transientCodes = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
])

const transientPattern =
  /getaddrinfo|EAI_AGAIN|ENOTFOUND|socket hang up|network|timed out/i

/**
 * True when a Discord login failure is caused by the network or DNS not being
 * ready yet, which is worth retrying. Invalid tokens and other permanent
 * errors return false.
 */
export function isTransientNetworkError(error) {
  if (!error) return false
  if (transientCodes.has(error.code)) return true

  return transientPattern.test(error.message || "")
}
