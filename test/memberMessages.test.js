import assert from "node:assert/strict"
import { PermissionFlagsBits } from "discord.js"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let sendMemberMessage
let welcomeSetup
let getGuildConfig

before(async () => {
  directory = path.join(tmpdir(), `rixelbot-member-messages-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  sendMemberMessage = (
    await import(`../systems/memberMessages.js?test=${Date.now()}`)
  ).sendMemberMessage
  welcomeSetup = (await import("../commands/welcome-setup.js")).default
  const configStore = await import("../handlers/guildConfigStore.js")
  getGuildConfig = configStore.getGuildConfig
})

after(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("welcome messages render placeholders without allowing mentions", async () => {
  await writeFile(
    path.join(directory, "guild-config.json"),
    JSON.stringify({
      "guild-members": {
        memberMessages: {
          welcome: {
            channelId: "welcome-channel",
            content: "Welcome {member} to {server}; member {count}!",
          },
        },
      },
    }),
  )

  const sent = []
  const member = {
    id: "member-1",
    user: { bot: false },
    displayName: "New Member",
    guild: {
      id: "guild-members",
      name: "Rixel",
      memberCount: 42,
      channels: {
        fetch: async (id) => ({
          isTextBased: () => id === "welcome-channel",
          send: async (payload) => sent.push(payload),
        }),
      },
    },
  }

  assert.equal(await sendMemberMessage(member, "welcome"), true)
  assert.deepEqual(sent, [
    {
      content: "Welcome New Member to Rixel; member 42!",
      allowedMentions: { parse: [] },
    },
  ])
})

test("member messages skip bots and unconfigured events", async () => {
  assert.equal(
    await sendMemberMessage(
      { user: { bot: true }, guild: { id: "guild-members" } },
      "welcome",
    ),
    false,
  )
  assert.equal(
    await sendMemberMessage(
      { user: { bot: false }, guild: { id: "guild-members" } },
      "leave",
    ),
    false,
  )
  await assert.rejects(
    sendMemberMessage(
      { user: { bot: false }, guild: { id: "guild-members" } },
      "unknown",
    ),
    /Unsupported member message event/,
  )
})

test("welcome setup requires Manage Server and configures a channel", async () => {
  const command = welcomeSetup.data.toJSON()
  assert.equal(command.name, "welcome-setup")
  assert.equal(command.default_member_permissions, "32")

  const deniedReplies = []
  await welcomeSetup.execute({
    inGuild: () => true,
    memberPermissions: { has: () => false },
    reply: async (payload) => deniedReplies.push(payload),
  })
  assert.match(deniedReplies[0].content, /Manage Server/)

  const replies = []
  const channel = {
    id: "welcome-channel",
    permissionsFor: () => ({ has: () => true }),
  }
  const interaction = {
    guildId: "guild-setup",
    inGuild: () => true,
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
    options: {
      getChannel: (name) =>
        name === "welcome_channel" ? channel : null,
      getString: (name) =>
        name === "welcome_message" ? "Hello {member}!" : null,
      getBoolean: () => null,
    },
    guild: {
      members: {
        me: {
          permissions: {
            has: (permission) =>
              permission === PermissionFlagsBits.ManageRoles,
          },
        },
      },
    },
    reply: async (payload) => replies.push(payload),
  }

  await welcomeSetup.execute(interaction)
  assert.match(replies[0].content, /Configured welcome messages/)
  assert.deepEqual((await getGuildConfig(interaction.guildId)).memberMessages, {
    welcome: {
      channelId: "welcome-channel",
      content: "Hello {member}!",
    },
  })
})

test("welcome setup can disable configured messages", async () => {
  const replies = []
  const interaction = {
    guildId: "guild-setup",
    inGuild: () => true,
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
    options: {
      getChannel: () => null,
      getString: () => null,
      getBoolean: (name) => name === "disable_welcome",
    },
    reply: async (payload) => replies.push(payload),
  }

  await welcomeSetup.execute(interaction)
  assert.match(replies[0].content, /Disabled welcome messages/)
  assert.equal(
    (await getGuildConfig(interaction.guildId)).memberMessages,
    undefined,
  )
})
