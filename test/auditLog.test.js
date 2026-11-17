import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let recordAuditEvent
let flushAuditLog
let sanitizeLogValue
let auditDirectory

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rixelbot-audit-"))
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  const auditLog = await import("../handlers/auditLog.js")
  recordAuditEvent = auditLog.recordAuditEvent
  flushAuditLog = auditLog.flushAuditLog
  sanitizeLogValue = auditLog.sanitizeLogValue
  auditDirectory = auditLog.auditDirectory
})

after(async () => {
  await flushAuditLog()

  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("audit values are stripped of control characters and capped", () => {
  assert.equal(sanitizeLogValue("ok\nforged line"), "ok forged line")
  assert.equal(sanitizeLogValue("x".repeat(500)).length, 200)
  assert.equal(sanitizeLogValue(undefined), undefined)
  assert.equal(sanitizeLogValue(null), undefined)
})

test("audit events are appended as one JSON object per line", async () => {
  await recordAuditEvent({
    type: "command",
    command: "warn",
    outcome: "success",
    userId: "user-1",
    guildId: "guild-1",
  })
  await recordAuditEvent({
    type: "command",
    command: "warn",
    outcome: "rate-limited",
    userId: "user-1",
    guildId: "guild-1",
  })
  await flushAuditLog()

  const month = new Date().toISOString().slice(0, 7)
  const content = await readFile(
    path.join(auditDirectory, `audit-${month}.jsonl`),
    "utf8",
  )
  const lines = content.trim().split("\n")

  assert.equal(lines.length, 2)
  assert.equal(JSON.parse(lines[0]).outcome, "success")
  assert.equal(JSON.parse(lines[1]).outcome, "rate-limited")
  assert.ok(JSON.parse(lines[0]).timestamp)
})
