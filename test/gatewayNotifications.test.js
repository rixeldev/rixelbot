import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"

import { registerGatewayNotifications } from "../systems/gatewayNotifications.js"

function fakeClient() {
  const client = new EventEmitter()

  client.user = { tag: "RixelBot#8068" }
  client.guilds = { cache: new Map([["1", {}]]) }
  client.ws = { shards: new Map() }

  return client
}

function recorder() {
  const calls = []

  return {
    calls,
    notifier: {
      notify: async (kind, message) => {
        calls.push({ kind, message })
        return true
      },
    },
  }
}

test("a short reconnect stays silent", () => {
  let clock = 1_000
  const client = fakeClient()
  const { calls, notifier } = recorder()

  registerGatewayNotifications(client, {
    notifier,
    reconnectThresholdMs: 60_000,
    now: () => clock,
  })

  client.emit("shardReconnecting", 0)
  clock += 5_000
  client.emit("shardResume", 0, 1)

  assert.equal(calls.length, 0)
})

test("a long outage reports its duration", () => {
  let clock = 1_000
  const client = fakeClient()
  const { calls, notifier } = recorder()

  registerGatewayNotifications(client, {
    notifier,
    reconnectThresholdMs: 60_000,
    now: () => clock,
  })

  client.emit("shardReconnecting", 0)
  clock += 120_000
  client.emit("shardResume", 0, 3)

  assert.equal(calls.length, 1)
  assert.match(calls[0].message, /reconnected after 120s/)
  assert.match(calls[0].message, /3 events replayed/)
})

test("unrecoverable disconnects and gateway errors always notify", () => {
  const client = fakeClient()
  const { calls, notifier } = recorder()

  registerGatewayNotifications(client, { notifier })

  client.emit("shardDisconnect", { code: 4004 }, 0)
  client.emit("shardError", new Error("boom"), 0)

  assert.equal(calls.length, 2)
  assert.equal(calls[0].kind, "disconnect")
  assert.match(calls[0].message, /code 4004/)
  assert.equal(calls[1].kind, "gateway-error")
})

test("coming online reports the bot name and server count", () => {
  const client = fakeClient()
  const { calls, notifier } = recorder()

  registerGatewayNotifications(client, { notifier })
  client.emit("ready", client)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].kind, "online")
  assert.match(calls[0].message, /RixelBot#8068 \(1 server\(s\)\)/)
})
