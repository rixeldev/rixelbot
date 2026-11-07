import assert from "node:assert/strict"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let detectSpam
let handleGuildMessageGuard
let handleMemberJoinGuard
let guardSetup

before(async () => {
  directory = path.join(tmpdir(), `rixelbot-guard-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  const autoModeration = await import(
    `../systems/autoModeration.js?test=${Date.now()}`
  )
  detectSpam = autoModeration.detectSpam
  handleGuildMessageGuard = autoModeration.handleGuildMessageGuard
  handleMemberJoinGuard = autoModeration.handleMemberJoinGuard
  guardSetup = (await import("../commands/guard-setup.js")).default
})

after(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("spam detection catches message bursts, repeated text, and mention floods", () => {
  const messages = [
    { timestamp: 9_000, normalizedContent: "hello" },
    { timestamp: 9_500, normalizedContent: "other" },
  ]

  assert.equal(
    detectSpam({
      messages: [
        ...messages,
        { timestamp: 9_600, normalizedContent: "third" },
        { timestamp: 9_700, normalizedContent: "fourth" },
        { timestamp: 9_800, normalizedContent: "fifth" },
      ],
      content: "hello",
      now: 10_000,
      messageLimit: 6,
    }).isSpam,
    true,
  )

  assert.equal(
    detectSpam({
      messages: [
        { timestamp: 9_000, normalizedContent: "hello" },
        { timestamp: 9_500, normalizedContent: "hello" },
      ],
      content: " HELLO ",
      now: 10_000,
      messageLimit: 6,
    }).duplicateCount,
    3,
  )

  assert.equal(
    detectSpam({
      messages: [],
      content: "please help",
      now: 10_000,
      mentionCount: 5,
    }).isSpam,
    true,
  )

  assert.equal(
    detectSpam({
      messages: [{ timestamp: 0, normalizedContent: "old" }],
      content: "normal",
      now: 10_000,
      windowMs: 5_000,
      messageLimit: 3,
    }).isSpam,
    false,
  )
})

test("message guard deletes repeated spam and invites, exempts moderators, and only alerts on raids", async () => {
  await writeFile(
    path.join(directory, "guild-config.json"),
    JSON.stringify({
      "guild-guard": {
        guardConfig: {
          enabled: true,
          alertChannelId: "alerts",
          spamProtectionEnabled: true,
          spamAction: "delete_alert",
          spamMessageLimit: 6,
          spamWindowSeconds: 8,
          mentionLimit: 5,
          raidDetectionEnabled: true,
          raidJoinLimit: 3,
          raidWindowSeconds: 10,
          inviteFilterEnabled: true,
          bypassRoleId: "trusted",
          ignoredChannelId: "ignored",
        },
      },
    }),
  )

    const alerts = []
    let deleteCount = 0
    const alertChannel = {
      isTextBased: () => true,
      send: async (payload) => alerts.push(payload),
    }
    const guild = {
      id: "guild-guard",
      ownerId: "owner",
      channels: {
        fetch: async () => alertChannel,
      },
      members: {
        me: {
          permissions: { has: () => true },
        },
      },
    }

    const makeMessage = (content, userId = "member", channelId = "general") => ({
      id: `message-${deleteCount + 1}`,
      guild,
      guildId: guild.id,
      channelId,
      author: { id: userId, bot: false },
      content,
      webhookId: null,
      mentions: {
        users: { size: 0 },
        roles: { size: 0 },
        everyone: false,
      },
      member: {
        id: userId,
        guild,
        permissionsIn: () => ({
          has: (permission) => userId === "moderator" && permission === 8192n,
        }),
        roles: { cache: new Map() },
      },
      channel: {
        permissionsFor: () => ({ has: () => true }),
      },
      delete: async () => {
        deleteCount += 1
      },
    })

    const first = makeMessage("same message")
    const second = makeMessage("same message")
    const third = makeMessage("same message")
    assert.equal(await handleGuildMessageGuard(first), false)
    assert.equal(await handleGuildMessageGuard(second), false)
    assert.equal(await handleGuildMessageGuard(third), true)
    assert.equal(deleteCount, 1)
    assert.match(alerts[0].content, /duplicates/)

    const moderatorInvite = makeMessage("discord.gg/example", "moderator")
    assert.equal(await handleGuildMessageGuard(moderatorInvite), false)
    const ignoredInvite = makeMessage("discord.gg/example", "member", "ignored")
    assert.equal(await handleGuildMessageGuard(ignoredInvite), false)
    const invite = makeMessage("Join us at https://discord.gg/example")
    assert.equal(await handleGuildMessageGuard(invite), true)
    assert.equal(deleteCount, 2)

    const member = { guild }
    assert.equal(await handleMemberJoinGuard(member), false)
    assert.equal(await handleMemberJoinGuard(member), false)
    assert.equal(await handleMemberJoinGuard(member), true)
    assert.equal(
      alerts.filter((alert) => /Possible raid detected/.test(alert.content))
        .length,
      1,
    )
    assert.equal(
      alerts.some((alert) => /automatically restricted/.test(alert.content)),
      true,
    )
})

test("guard setup exposes permission-gated configurable options", () => {
  const command = guardSetup.data.toJSON()

  assert.equal(command.name, "guard-setup")
  assert.equal(command.default_member_permissions, "32")
  assert.deepEqual(command.options.slice(0, 5).map((option) => option.name), [
    "alert_channel",
    "spam_protection",
    "spam_action",
    "raid_detection",
    "invite_filter",
  ])
})
