import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

import {
  createWebhookNotifier,
  isCooldownExpired,
} from "../handlers/webhookNotifier.js"

let directory
let originalInfo

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rixelbot-notify-"))
  originalInfo = console.info
  console.info = () => {}
})

after(async () => {
  console.info = originalInfo
  await rm(directory, { recursive: true, force: true })
})

test("cooldown comparison handles missing and recent timestamps", () => {
  assert.equal(isCooldownExpired(undefined, 10_000, 5_000), true)
  assert.equal(isCooldownExpired(9_000, 10_000, 5_000), false)
  assert.equal(isCooldownExpired(5_000, 10_000, 5_000), true)
})

test("notifier throttles each kind and persists the state", async () => {
  const statePath = path.join(directory, "state.json")
  let clock = 1_000

  const notifier = createWebhookNotifier({
    webhookUrl: "",
    statePath,
    cooldownMs: 5_000,
    now: () => clock,
  })

  assert.equal(await notifier.notify("stopped", "crash"), true)
  assert.equal(await notifier.notify("stopped", "crash"), false)
  assert.equal(await notifier.notify("started", "boot"), true)

  clock += 5_000
  assert.equal(await notifier.notify("stopped", "crash"), true)

  await notifier.flush()

  const reloaded = createWebhookNotifier({
    webhookUrl: "",
    statePath,
    cooldownMs: 5_000,
    now: () => clock,
  })

  assert.equal(await reloaded.notify("stopped", "crash"), false)
})
