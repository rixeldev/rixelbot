import assert from "node:assert/strict"
import { PermissionFlagsBits } from "discord.js"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let getGuildConfig
let setRolePanelConfig
let handleRoleReaction
let isCosmeticRole
let hasReactionPanelPermissions
let isSingleUnicodeEmoji
let rolePanel
let removeRolePanel

before(async () => {
  directory = path.join(tmpdir(), `rixelbot-reaction-roles-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  const configStore = await import(
    `../handlers/guildConfigStore.js?test=${Date.now()}`
  )
  getGuildConfig = configStore.getGuildConfig
  setRolePanelConfig = configStore.setRolePanelConfig

  const reactionRoles = await import(
    `../systems/reactionRoles.js?test=${Date.now()}`
  )
  handleRoleReaction = reactionRoles.handleRoleReaction
  isCosmeticRole = reactionRoles.isCosmeticRole
  hasReactionPanelPermissions = reactionRoles.hasReactionPanelPermissions

  const panelModule = await import("../commands/role-panel.js")
  isSingleUnicodeEmoji = panelModule.isSingleUnicodeEmoji
  rolePanel = panelModule.default
  removeRolePanel = (await import("../commands/role-panel-remove.js")).default
})

after(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("reaction roles add and remove only the configured role on its panel", async () => {
  await setRolePanelConfig("guild-reaction", "panel-message", {
    channelId: "panel-channel",
    roles: { "🎨": "cosmetic-role" },
  })

  const changes = []
  const role = {
    id: "cosmetic-role",
    permissions: { bitfield: 0n },
    editable: true,
  }
  const guild = {
    id: "guild-reaction",
    members: {
      fetch: async (id) => ({
        user: { id, bot: false },
        roles: {
          add: async (assigned, reason) => changes.push(["add", assigned, reason]),
          remove: async (assigned, reason) =>
            changes.push(["remove", assigned, reason]),
        },
      }),
    },
    roles: { fetch: async () => role },
  }
  const message = {
    id: "panel-message",
    channelId: "panel-channel",
    guild,
    partial: false,
  }
  const reaction = {
    partial: false,
    message,
    emoji: { name: "🎨" },
  }

  assert.equal(await handleRoleReaction(reaction, { id: "member" }, true), true)
  assert.equal(await handleRoleReaction(reaction, { id: "member" }, false), true)
  assert.deepEqual(changes.map(([action]) => action), ["add", "remove"])

  assert.equal(
    await handleRoleReaction(
      { ...reaction, emoji: { name: "❓" } },
      { id: "member" },
      true,
    ),
    false,
  )
  assert.equal(
    await handleRoleReaction(reaction, { id: "bot", bot: true }, true),
    false,
  )
})

test("reaction assignment refuses a role that later gains permissions", async () => {
  await setRolePanelConfig("guild-reaction", "panel-message", {
    channelId: "panel-channel",
    roles: { "🎨": "cosmetic-role" },
  })

  const role = {
    id: "cosmetic-role",
    permissions: { bitfield: PermissionFlagsBits.ManageGuild },
    editable: true,
  }
  const guild = {
    id: "guild-reaction",
    members: {
      fetch: async () => ({
        user: { bot: false },
        roles: { add: async () => assert.fail("must not assign") },
      }),
    },
    roles: { fetch: async () => role },
  }
  const reaction = {
    partial: false,
    emoji: { name: "🎨" },
    message: {
      id: "panel-message",
      channelId: "panel-channel",
      guild,
      partial: false,
    },
  }

  await assert.rejects(
    handleRoleReaction(reaction, { id: "member" }, true),
    /now has permissions/,
  )
})

test("role panels accept only permissionless roles below functional roles", () => {
  const functionalRole = { id: "staff", position: 5, permissions: { bitfield: 8n } }
  const everyone = { id: "everyone", position: 0, permissions: { bitfield: 0n } }
  const guild = {
    roles: {
      everyone,
      cache: {
        filter: (callback) =>
          [everyone, functionalRole].filter(callback),
      },
    },
  }

  assert.equal(
    isCosmeticRole(
      {
        id: "color",
        position: 2,
        managed: false,
        editable: true,
        permissions: { bitfield: 0n },
      },
      guild,
    ),
    true,
  )
  assert.equal(
    isCosmeticRole(
      {
        id: "powerful",
        position: 2,
        managed: false,
        editable: true,
        permissions: { bitfield: PermissionFlagsBits.ManageGuild },
      },
      guild,
    ),
    false,
  )
  assert.equal(
    isCosmeticRole(
      {
        id: "higher-than-staff",
        position: 7,
        managed: false,
        editable: true,
        permissions: { bitfield: 0n },
      },
      guild,
    ),
    false,
  )
  assert.equal(isSingleUnicodeEmoji("🎨"), true)
  assert.equal(isSingleUnicodeEmoji("🇺🇸"), true)
  assert.equal(isSingleUnicodeEmoji("🎨🎉"), false)
  assert.equal(isSingleUnicodeEmoji("not emoji"), false)
})

test("role panel command publishes reactions after saving panel configuration", async () => {
  const command = rolePanel.data.toJSON()
  assert.equal(command.name, "role-panel")
  assert.equal(command.default_member_permissions, "32")
  assert.equal(command.options.length, 23)

  const reactions = []
  let publishedPayload
  const role = {
    id: "color-role",
    name: "Artist",
    position: 2,
    managed: false,
    editable: true,
    permissions: { bitfield: 0n },
    toString: () => "<@&color-role>",
  }
  const staffRole = {
    id: "staff-role",
    position: 5,
    permissions: { bitfield: PermissionFlagsBits.ManageGuild },
  }
  const channel = {
    id: "roles-channel",
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => {
      publishedPayload = payload
      return {
        id: "created-panel",
        url: "https://discord.test/panel",
        react: async (emoji) => reactions.push(emoji),
        delete: async () => {},
      }
    },
  }
  const replies = []
  const interaction = {
    guildId: "guild-panel-command",
    inGuild: () => true,
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
    guild: {
      roles: {
        everyone: { id: "everyone" },
        cache: { filter: (callback) => [staffRole].filter(callback) },
      },
      members: {
        me: {
          permissions: { has: () => true },
        },
      },
    },
    options: {
      getChannel: () => channel,
      getRole: (name) => (name === "role_1" ? role : null),
      getString: (name) => {
        if (name === "emoji_1") return "🎨"
        if (name === "title") return null
        if (name === "description") return null
        return null
      },
    },
    deferReply: async () => {},
    editReply: async (payload) => replies.push(payload),
    reply: async (payload) => replies.push(payload),
  }

  await rolePanel.execute(interaction)
  assert.deepEqual(reactions, ["🎨"])
  assert.deepEqual(publishedPayload.allowedMentions, { parse: [] })
  assert.match(replies[0], /role panel is ready/)
  assert.deepEqual(
    (await getGuildConfig(interaction.guildId)).rolePanels["created-panel"]
      .roles,
    { "🎨": "color-role" },
  )
})

test("role panel permission check includes reaction and history access", () => {
  const required = []
  const channel = {
    permissionsFor: () => ({
      has: (permissions) => {
        required.push(...permissions)
        return true
      },
    }),
  }

  assert.equal(hasReactionPanelPermissions(channel, {}), true)
  assert.ok(required.includes(PermissionFlagsBits.AddReactions))
  assert.ok(required.includes(PermissionFlagsBits.ReadMessageHistory))
})

test("administrators can disable a panel so its reactions stop changing roles", async () => {
  await setRolePanelConfig("guild-disable-panel", "panel-to-disable", {
    channelId: "roles-channel",
    roles: { "🎨": "color-role" },
  })

  const replies = []
  await removeRolePanel.execute({
    guildId: "guild-disable-panel",
    inGuild: () => true,
    memberPermissions: {
      has: (permission) => permission === PermissionFlagsBits.ManageGuild,
    },
    options: { getString: () => "panel-to-disable" },
    reply: async (payload) => replies.push(payload),
  })

  assert.match(replies[0].content, /panel is disabled/)
  assert.equal(
    (await getGuildConfig("guild-disable-panel")).rolePanels,
    undefined,
  )
})
