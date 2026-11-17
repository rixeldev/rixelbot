import assert from "node:assert/strict"
import { test } from "node:test"

import { createRateLimiter, readPositiveInteger } from "../handlers/rateLimiter.js"

test("rate limiter allows up to the limit inside the window", () => {
  let clock = 1_000
  const limiter = createRateLimiter({
    limit: 3,
    windowMs: 10_000,
    now: () => clock,
  })

  assert.deepEqual(limiter.consume("user"), {
    allowed: true,
    remaining: 2,
    retryAfterMs: 0,
  })
  assert.equal(limiter.consume("user").remaining, 1)
  assert.equal(limiter.consume("user").remaining, 0)

  const blocked = limiter.consume("user")
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterMs, 10_000)
})

test("rate limiter isolates keys and resets after the window", () => {
  let clock = 0
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: 5_000,
    now: () => clock,
  })

  assert.equal(limiter.consume("guild-a:user-1").allowed, true)
  assert.equal(limiter.consume("guild-a:user-1").allowed, false)
  assert.equal(limiter.consume("guild-b:user-1").allowed, true)

  clock = 5_000

  const retry = limiter.consume("guild-a:user-1")
  assert.equal(retry.allowed, true)
})

test("rate limiter bounds memory for untrusted keys", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: 60_000,
    maxKeys: 2,
  })

  limiter.consume("a")
  limiter.consume("b")
  limiter.consume("c")

  assert.equal(limiter.size, 2)
})

test("rate limiter rejects invalid configuration", () => {
  assert.throws(() => createRateLimiter({ limit: 0, windowMs: 1 }), TypeError)
  assert.throws(() => createRateLimiter({ limit: 1, windowMs: 0 }), TypeError)
})

test("readPositiveInteger falls back on missing or invalid values", () => {
  assert.equal(readPositiveInteger("7", 5), 7)
  assert.equal(readPositiveInteger(undefined, 5), 5)
  assert.equal(readPositiveInteger("abc", 5), 5)
  assert.equal(readPositiveInteger("-3", 5), 5)
})
