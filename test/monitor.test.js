import assert from "node:assert/strict"
import { test } from "node:test"

import { planAlerts, evaluateHealth } from "../scripts/monitor.js"

const cooldown = 1_800_000

function freshState() {
  return { alerts: {}, active: {} }
}

test("a new problem alerts immediately", () => {
  const state = freshState()
  const problems = [["service", "service is not active"]]

  const result = planAlerts(state, problems, 1_000, cooldown)

  assert.equal(result.alerts.length, 1)
  assert.equal(result.alerts[0].kind, "service")
  assert.equal(result.recovered.length, 0)
})

test("a repeated problem waits for the cooldown", () => {
  const state = freshState()
  const problems = [["service", "service is not active"]]

  planAlerts(state, problems, 1_000, cooldown)

  const early = planAlerts(state, problems, 1_000 + cooldown - 1, cooldown)
  assert.equal(early.alerts.length, 0)

  const later = planAlerts(state, problems, 1_000 + cooldown, cooldown)
  assert.equal(later.alerts.length, 1)
})

test("different problems keep independent cooldowns", () => {
  const state = freshState()

  planAlerts(state, [["service", "down"]], 1_000, cooldown)

  const result = planAlerts(
    state,
    [
      ["service", "down"],
      ["memory", "memory is 900 MB"],
    ],
    1_000 + 60_000,
    cooldown,
  )

  assert.deepEqual(
    result.alerts.map((alert) => alert.kind),
    ["memory"],
  )
})

test("a resolved problem emits one recovery and clears its cooldown", () => {
  const state = freshState()

  planAlerts(state, [["service", "service is not active"]], 0, cooldown)

  const resolved = planAlerts(state, [], 10 * 60_000, cooldown)

  assert.equal(resolved.alerts.length, 0)
  assert.equal(resolved.recovered.length, 1)
  assert.match(resolved.recovered[0].message, /resolved after 10 min/)
  assert.doesNotMatch(
    resolved.recovered[0].message,
    /service is not active/,
    "recovery notices must not repeat the stale problem text",
  )

  const stillResolved = planAlerts(state, [], 20 * 60_000, cooldown)
  assert.equal(stillResolved.recovered.length, 0)

  const recurrence = planAlerts(
    state,
    [["service", "service is not active"]],
    21 * 60_000,
    cooldown,
  )
  assert.equal(recurrence.alerts.length, 1)
})

test("a 503 only becomes a problem after the grace period", () => {
  const grace = 600_000
  const url = "http://127.0.0.1:3000/health"

  const first = evaluateHealth({
    health: { ok: false, status: 503 },
    degradedSince: null,
    now: 1_000,
    graceMs: grace,
    healthUrl: url,
  })

  assert.equal(first.problem, null)
  assert.equal(first.degradedSince, 1_000)

  const short = evaluateHealth({
    health: { ok: false, status: 503 },
    degradedSince: first.degradedSince,
    now: 1_000 + 5 * 60_000,
    graceMs: grace,
    healthUrl: url,
  })
  assert.equal(short.problem, null)

  const long = evaluateHealth({
    health: { ok: false, status: 503 },
    degradedSince: first.degradedSince,
    now: 1_000 + 10 * 60_000,
    graceMs: grace,
    healthUrl: url,
  })
  assert.match(long.problem[1], /not been ready for 10 min \(status 503\)/)
})

test("a healthy or unreachable endpoint is decided immediately", () => {
  const url = "http://127.0.0.1:3000/health"

  const healthy = evaluateHealth({
    health: { ok: true, status: 200 },
    degradedSince: 5_000,
    now: 6_000,
    graceMs: 600_000,
    healthUrl: url,
  })
  assert.equal(healthy.problem, null)
  assert.equal(healthy.degradedSince, null)

  const down = evaluateHealth({
    health: { ok: false, status: 0 },
    degradedSince: 5_000,
    now: 6_000,
    graceMs: 600_000,
    healthUrl: url,
  })
  assert.match(down.problem[1], /health check failed \(status 0\)/)
})
