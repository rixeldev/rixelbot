import assert from "node:assert/strict"
import { PermissionFlagsBits } from "discord.js"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let addWarning
let getWarnings
let revokeWarning
let clearWarn

before(async () => {
  directory = path.join(tmpdir(), `rixelbot-warnings-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  const warningStore = await import("../handlers/warningsStore.js")
  addWarning = warningStore.addWarning
  getWarnings = warningStore.getWarnings
  revokeWarning = warningStore.revokeWarning
  clearWarn = (await import("../commands/clearwarn.js")).default
})

after(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("revoking a warning preserves its history and prevents duplicate revocation", async () => {
  const warning = await addWarning("guild-warnings", "user-1", {
    moderatorId: "moderator-1",
    reason: "Original reason",
  })

  const revoked = await revokeWarning(
    "guild-warnings",
    "user-1",
    warning.id,
    {
      moderatorId: "moderator-2",
      reason: "Issued in error",
    },
  )

  assert.equal(revoked.id, warning.id)
  assert.equal(revoked.reason, "Original reason")
  assert.equal(revoked.revokedBy, "moderator-2")
  assert.equal(revoked.revocationReason, "Issued in error")
  assert.ok(revoked.revokedAt)
  assert.equal(
    await revokeWarning("guild-warnings", "user-1", warning.id, {
      moderatorId: "moderator-2",
      reason: "Duplicate",
    }),
    null,
  )
  assert.equal((await getWarnings("guild-warnings", "user-1")).length, 1)
  assert.equal(
    await revokeWarning("guild-warnings", "other-user", warning.id, {
      moderatorId: "moderator-2",
      reason: "Wrong member",
    }),
    null,
  )
})

test("clearwarn requires moderation permission and revokes/logs the selected warning", async () => {
  const command = clearWarn.data.toJSON()
  assert.equal(command.name, "clearwarn")
  assert.equal(command.default_member_permissions, "1099511627776")

  const deniedReplies = []
  await clearWarn.execute({
    inGuild: () => true,
    memberPermissions: { has: () => false },
    reply: async (payload) => deniedReplies.push(payload),
  })
  assert.match(deniedReplies[0].content, /Moderate Members/)

  const warning = await addWarning("guild-command", "user-2", {
    moderatorId: "moderator-1",
    reason: "Duplicate warning",
  })
  const replies = []
  const logChannel = { isTextBased: () => true, messages: {}, send: async () => {} }
  const interaction = {
    guildId: "guild-command",
    guild: {
      id: "guild-command",
      channels: { fetch: async () => logChannel },
    },
    client: {},
    user: { id: "moderator-2", tag: "Moderator#0001" },
    memberPermissions: {
      has: (permission) =>
        permission === PermissionFlagsBits.ModerateMembers,
    },
    inGuild: () => true,
    options: {
      getUser: () => ({ id: "user-2", tag: "Member#0001" }),
      getString: (name) =>
        name === "warning_id" ? warning.id : "Issued in error",
    },
    deferReply: async () => {},
    editReply: async (content) => replies.push(content),
  }

  await clearWarn.execute(interaction)
  assert.match(replies[0], /was revoked/)
  assert.equal(
    (await getWarnings("guild-command", "user-2"))[0].revokedBy,
    "moderator-2",
  )
})
