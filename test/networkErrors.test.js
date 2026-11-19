import assert from "node:assert/strict"
import { test } from "node:test"

import { isTransientNetworkError } from "../handlers/networkErrors.js"

test("DNS and network failures are transient", () => {
  assert.equal(isTransientNetworkError({ code: "EAI_AGAIN" }), true)
  assert.equal(isTransientNetworkError({ code: "ENOTFOUND" }), true)
  assert.equal(isTransientNetworkError({ code: "ECONNRESET" }), true)
  assert.equal(
    isTransientNetworkError(
      new Error("getaddrinfo EAI_AGAIN discord.com"),
    ),
    true,
  )
})

test("permanent failures are not retried", () => {
  assert.equal(isTransientNetworkError(undefined), false)
  assert.equal(isTransientNetworkError(new Error("An invalid token was provided")), false)
  assert.equal(isTransientNetworkError({ code: "TokenInvalid" }), false)
})
