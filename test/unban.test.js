import assert from "node:assert/strict"
import { PermissionFlagsBits } from "discord.js"
import { test } from "node:test"

import unban from "../commands/unban.js"

const userId = "12345678901234567"

function makeInteraction({
  permitted = true,
  fetchBan = async () => ({ user: { id: userId, tag: "User#0001" } }),
  unbanUser = async () => ({ id: userId, tag: "User#0001" }),
  userIdValue = userId,
} = {}) {
  const replies = []
  const interaction = {
    inGuild: () => true,
    memberPermissions: {
      has: (permission) =>
        permitted && permission === PermissionFlagsBits.BanMembers,
    },
    guild: {
      id: "guild-unban",
      members: {
        me: {
          permissions: {
            has: (permission) => permission === PermissionFlagsBits.BanMembers,
          },
        },
        unban: unbanUser,
      },
      bans: { fetch: fetchBan },
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          messages: {},
          send: async () => {},
        }),
      },
    },
    client: {},
    user: { id: "moderator-id", tag: "Moderator#0001" },
    options: {
      getString: (name) =>
        name === "user_id" ? userIdValue : "Appeal reviewed",
    },
    deferReply: async () => {},
    editReply: async (content) => replies.push(content),
    reply: async (payload) => replies.push(payload),
  }

  return { interaction, replies }
}

test("unban command requires Ban Members and registers a user ID option", async () => {
  const command = unban.data.toJSON()
  assert.equal(command.name, "unban")
  assert.equal(command.default_member_permissions, "4")
  assert.equal(command.options[0].name, "user_id")
  assert.equal(command.options[0].required, true)

  const { interaction, replies } = makeInteraction({ permitted: false })
  await unban.execute(interaction)
  assert.match(replies[0].content, /Ban Members/)
})

test("unban removes an existing ban and refuses malformed IDs", async () => {
  let requestedId
  let unbanArgs
  const { interaction, replies } = makeInteraction({
    fetchBan: async (id) => {
      requestedId = id
      return { user: { id, tag: "User#0001" } }
    },
    unbanUser: async (...args) => {
      unbanArgs = args
      return { id: args[0], tag: "User#0001" }
    },
  })

  await unban.execute(interaction)
  assert.equal(requestedId, userId)
  assert.deepEqual(unbanArgs, [
    userId,
    "Appeal reviewed | Moderator: Moderator#0001",
  ])
  assert.match(replies[0], /has been unbanned/)

  const invalid = makeInteraction({ userIdValue: "not-an-id" })
  await unban.execute(invalid.interaction)
  assert.match(invalid.replies[0], /valid Discord user ID/)
})

test("unban reports a user who has no active ban without unbanning", async () => {
  let unbanCalled = false
  const notBanned = makeInteraction({
    fetchBan: async () => {
      const error = new Error("Unknown Ban")
      error.code = 10026
      throw error
    },
    unbanUser: async () => {
      unbanCalled = true
    },
  })

  await unban.execute(notBanned.interaction)
  assert.match(notBanned.replies[0], /not banned/)
  assert.equal(unbanCalled, false)
})
