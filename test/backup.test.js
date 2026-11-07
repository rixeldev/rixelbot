import assert from "node:assert/strict"
import { PermissionFlagsBits } from "discord.js"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let createGuildBackup
let backupCommand

before(async () => {
  directory = path.join(tmpdir(), `rixelbot-backup-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  createGuildBackup = (
    await import(`../systems/backup.js?test=${Date.now()}`)
  ).createGuildBackup
  backupCommand = (await import("../commands/backup.js")).default
})

after(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("backup contains this server's data and excludes other servers", async () => {
  await Promise.all([
    writeFile(
      path.join(directory, "guild-config.json"),
      JSON.stringify({
        "guild-1": {
          logChannelId: "logs",
          ticketConfig: { categoryId: "tickets" },
        },
        "guild-2": { logChannelId: "other-logs" },
      }),
    ),
    writeFile(
      path.join(directory, "warnings.json"),
      JSON.stringify({
        "guild-1": { "user-1": [{ id: "warning-1", reason: "Test" }] },
        "guild-2": { "user-2": [{ id: "warning-2", reason: "Private" }] },
      }),
    ),
    writeFile(
      path.join(directory, "tickets.json"),
      JSON.stringify({
        tickets: {
          "ticket-1": { guildId: "guild-1", ownerId: "user-1" },
          "ticket-2": { guildId: "guild-2", ownerId: "user-2" },
        },
      }),
    ),
    writeFile(
      path.join(directory, "temporaryVoice.json"),
      JSON.stringify({
        guilds: {
          "guild-1": {
            generatorChannelId: "voice",
            temporaryChannels: { "room-1": { ownerId: "user-1" } },
          },
          "guild-2": {
            generatorChannelId: "other-voice",
            temporaryChannels: {},
          },
        },
      }),
    ),
  ])

  const { buffer, fileName } = await createGuildBackup({
    id: "guild-1",
    name: "Rixel",
  })
  const backup = JSON.parse(buffer.toString("utf8"))

  assert.match(fileName, /^rixelbot-backup-guild-1-\d{4}-\d{2}-\d{2}\.json$/)
  assert.equal(backup.schemaVersion, 1)
  assert.equal(backup.guild.id, "guild-1")
  assert.equal(backup.data.configuration.logChannelId, "logs")
  assert.deepEqual(Object.keys(backup.data.warnings), ["user-1"])
  assert.deepEqual(Object.keys(backup.data.tickets), ["ticket-1"])
  assert.equal(backup.data.temporaryVoice.generatorChannelId, "voice")
  assert.doesNotMatch(buffer.toString("utf8"), /guild-2|other-logs|warning-2/)
})

test("backup command requires Manage Server and sends an ephemeral JSON file", async () => {
  const command = backupCommand.data.toJSON()
  assert.equal(command.name, "backup")
  assert.equal(command.default_member_permissions, "32")

  const deniedReplies = []
  await backupCommand.execute({
    inGuild: () => true,
    memberPermissions: { has: () => false },
    reply: async (payload) => deniedReplies.push(payload),
  })
  assert.match(deniedReplies[0].content, /Manage Server/)

  const replies = []
  const interaction = {
    guildId: "guild-1",
    guild: { id: "guild-1", name: "Rixel" },
    inGuild: () => true,
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
    deferReply: async (options) => replies.push(options),
    editReply: async (payload) => replies.push(payload),
  }

  await backupCommand.execute(interaction)
  assert.deepEqual(replies[0], { ephemeral: true })
  assert.equal(replies[1].files.length, 1)
  assert.match(replies[1].files[0].name, /^rixelbot-backup-guild-1-/)
  assert.match(replies[1].content, /store the file securely/)
})
