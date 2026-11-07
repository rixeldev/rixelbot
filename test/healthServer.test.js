import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { parsePort, startHealthServer } from "../systems/healthServer.js"

const servers = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

test("health endpoint reports readiness without exposing other routes", async () => {
  let ready = false
  const server = await startHealthServer({
    isReady: () => ready,
    port: 0,
  })
  servers.push(server)

  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  const startingResponse = await fetch(`${baseUrl}/health`)
  assert.equal(startingResponse.status, 503)
  assert.equal(await startingResponse.text(), "unavailable")

  ready = true
  const readyResponse = await fetch(`${baseUrl}/health`)
  assert.equal(readyResponse.status, 200)
  assert.equal(await readyResponse.text(), "ok")
  assert.equal(readyResponse.headers.get("cache-control"), "no-store")

  const unknownResponse = await fetch(`${baseUrl}/`)
  assert.equal(unknownResponse.status, 404)

  const methodResponse = await fetch(`${baseUrl}/health`, {
    method: "POST",
  })
  assert.equal(methodResponse.status, 405)
  assert.equal(methodResponse.headers.get("allow"), "GET")
})

test("PORT is validated before starting the service", () => {
  assert.equal(parsePort("8080"), 8080)
  assert.throws(() => parsePort("0"), /PORT must be an integer/)
  assert.throws(() => parsePort("invalid"), /PORT must be an integer/)
})
