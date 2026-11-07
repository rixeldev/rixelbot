import assert from "node:assert/strict"
import { PermissionFlagsBits } from "discord.js"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"

let directory
let previousDataDir
let handleMemberAutoRole
let setAutoRoleConfig
let getGuildConfig
let autoRoleSetup

before(async () => {
  directory = path.join(tmpdir(), `rixelbot-auto-role-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  const autoRole = await import(`../systems/autoRole.js?test=${Date.now()}`)
  handleMemberAutoRole = autoRole.handleMemberAutoRole
  const configStore = await import(
    `../handlers/guildConfigStore.js?test=${Date.now()}`
  )
  setAutoRoleConfig = configStore.setAutoRoleConfig
  getGuildConfig = configStore.getGuildConfig
  autoRoleSetup = (await import("../commands/autorole-setup.js")).default
})

after(async () => {
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR
  } else {
    process.env.DATA_DIR = previousDataDir
  }

  await rm(directory, { recursive: true, force: true })
})

test("configured auto-role is assigned to new human members", async () => {
  await setAutoRoleConfig("guild-auto-role", "member-role")
  const added = []
  const role = { id: "member-role", editable: true }
  const member = {
    id: "new-member",
    user: { bot: false },
    guild: {
      id: "guild-auto-role",
      roles: { fetch: async (id) => (id === role.id ? role : null) },
      members: {
        me: { permissions: { has: () => true } },
      },
    },
    roles: {
      cache: new Map(),
      add: async (...args) => added.push(args),
    },
  }

  assert.equal(await handleMemberAutoRole(member), true)
  assert.deepEqual(added, [[role, "Configured automatic member role"]])
})

test("auto-role skips bots and does nothing when disabled", async () => {
  await setAutoRoleConfig("guild-auto-role", null)
  const member = {
    user: { bot: true },
    guild: { id: "guild-auto-role" },
  }

  assert.equal(await handleMemberAutoRole(member), false)
  assert.equal(
    await handleMemberAutoRole({
      ...member,
      user: { bot: false },
    }),
    false,
  )
})

test("auto-role setup requires Manage Server and exposes an optional role", async () => {
  const command = autoRoleSetup.data.toJSON()

  assert.equal(command.name, "autorole-setup")
  assert.equal(command.default_member_permissions, "32")
  assert.equal(command.options[0].name, "role")
  assert.equal(command.options[0].required, false)

  const replies = []
  await autoRoleSetup.execute({
    inGuild: () => true,
    memberPermissions: { has: () => false },
    reply: async (reply) => replies.push(reply),
  })
  assert.match(replies[0].content, /Manage Server/)
})

test("auto-role setup accepts only low-privilege roles manageable by the bot", async () => {
  const replies = []
  const role = {
    id: "member-role",
    managed: false,
    editable: true,
    permissions: { has: () => false },
    toString: () => "<@&member-role>",
  }
  const interaction = {
    guildId: "guild-auto-role",
    inGuild: () => true,
    memberPermissions: { has: () => true },
    options: { getRole: () => role },
    guild: {
      roles: { everyone: { id: "everyone" } },
      members: {
        me: {
          permissions: {
            has: (permission) => permission === PermissionFlagsBits.ManageRoles,
          },
        },
      },
    },
    reply: async (reply) => replies.push(reply),
  }

  await autoRoleSetup.execute(interaction)
  assert.match(replies[0].content, /New human members/)
  assert.equal((await getGuildConfig(interaction.guildId)).autoRoleConfig.roleId, role.id)

  replies.length = 0
  interaction.options.getRole = () => ({
    ...role,
    permissions: {
      has: (permission) => permission === PermissionFlagsBits.Administrator,
    },
  })

  await autoRoleSetup.execute(interaction)
  assert.match(replies[0].content, /cannot grant administrative/)
  assert.equal((await getGuildConfig(interaction.guildId)).autoRoleConfig.roleId, role.id)
})
