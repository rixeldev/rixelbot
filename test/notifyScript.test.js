import assert from "node:assert/strict"
import { test } from "node:test"

import { describeServiceStop } from "../scripts/notify.js"

test("a clean stop produces no notification", () => {
  assert.equal(describeServiceStop({ serviceResult: "success" }), null)
  assert.equal(describeServiceStop({}), null)
})

test("an unexpected exit reports the numeric status and pid", () => {
  assert.equal(
    describeServiceStop({
      serviceResult: "exit-code",
      exitCode: "exited",
      exitStatus: "1",
      mainPid: "4242",
    }),
    "stopped unexpectedly (exit status 1, pid 4242)",
  )
})

test("a signal death names the signal", () => {
  assert.equal(
    describeServiceStop({
      serviceResult: "signal",
      exitCode: "killed",
      exitStatus: "KILL",
    }),
    "stopped by signal KILL",
  )
})

test("resource, timeout and restart-limit results are described", () => {
  assert.match(
    describeServiceStop({ serviceResult: "resources" }),
    /resource limit reached/,
  )
  assert.match(
    describeServiceStop({ serviceResult: "timeout" }),
    /timed out/,
  )
  assert.match(
    describeServiceStop({ serviceResult: "start-limit-hit" }),
    /gave up/,
  )
  assert.match(
    describeServiceStop({ serviceResult: "core-dump" }),
    /dumped core/,
  )
})
