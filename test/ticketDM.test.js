import assert from "node:assert/strict"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

test("a direct message opens a private ticket in the user's configured server", async () => {
  const directory = path.join(tmpdir(), `rixelbot-dm-${Date.now()}`)
  await mkdir(directory, { recursive: true })
  const previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  try {
    await writeFile(
      path.join(directory, "guild-config.json"),
      JSON.stringify({
        "guild-1": {
          ticketConfig: {
            categoryId: "category-guild-1",
            supportRoleId: "support-guild-1",
            panelChannelId: "panel-1",
            transcriptChannelId: "transcripts-guild-1",
          },
        },
      }),
    )

    const { handleTicketDirectMessage, handleTicketInteraction } = await import(
      `../systems/tickets.js?dm-test=${Date.now()}`
    )

    const ticketMessages = []
    const directMessages = []
    const notifications = []
    let channelSequence = 0
    const client = {
      guilds: { cache: new Map() },
    }
    client.user = { id: "bot-1" }

    function createGuild(id, name) {
      const supportRole = { id: `support-${id}` }
      const notificationChannel = {
        isTextBased: () => true,
        permissionsFor: (role) => ({
          has: () => role.id !== `everyone-${id}`,
        }),
        send: async (payload) => notifications.push(payload),
      }
      const guild = {
        id,
        name,
        client,
        roles: {
          everyone: { id: `everyone-${id}` },
          cache: new Map([[supportRole.id, supportRole]]),
        },
        members: { fetch: async () => ({ id: "member" }) },
        channels: {
          cache: new Map(),
          fetch: async () => notificationChannel,
          create: async (options) => {
            assert.equal(options.parent, `category-${id}`)
            assert.ok(
              options.permissionOverwrites.some(
                (overwrite) =>
                  overwrite.id === `everyone-${id}` &&
                  overwrite.deny.includes(1024n),
              ),
            )
            const userOverwrite = options.permissionOverwrites.find(
              (overwrite) => overwrite.id.startsWith("user-"),
            )
            assert.ok(userOverwrite.deny.includes(2048n))

            const channel = {
              id: `1234567890123456${String(++channelSequence).padStart(2, "0")}`,
              isTextBased: () => true,
              send: async (payload) => {
                ticketMessages.push(payload)
                return { id: `ticket-message-${ticketMessages.length}` }
              },
            }
            return channel
          },
        },
      }
      client.guilds.cache.set(id, guild)
      return guild
    }

    const guild = createGuild("guild-1", "Support Server")
    const user = createUser("user-1")
    const message = {
      author: user,
      client,
      channel: {
        send: async (payload) => directMessages.push(payload),
      },
      content: "I need help with my account.",
      attachments: new Map(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }

    await handleTicketDirectMessage(message)

    assert.equal(ticketMessages.length, 2)
    assert.equal(directMessages.length, 1)
    assert.equal(notifications.length, 1)
    assert.deepEqual(
      notifications[0].allowedMentions.roles,
      ["support-guild-1"],
    )
    assert.match(directMessages[0].content, /Support Server/)
    assert.equal(
      directMessages[0].allowedMentions.parse.length,
      0,
    )

    let tickets = JSON.parse(
      await readFile(path.join(directory, "tickets.json"), "utf8"),
    )
    const ticket = Object.values(tickets.tickets)[0]
    assert.equal(ticket.source, "dm")
    assert.equal(ticket.ownerId, "user-1")
    assert.equal(ticket.supportRoleId, "support-guild-1")
    assert.equal(ticket.status, "open")

    await writeFile(
      path.join(directory, "guild-config.json"),
      JSON.stringify({
        "guild-1": {
          ticketConfig: {
            categoryId: "category-guild-1",
            supportRoleId: "support-guild-1",
            panelChannelId: "panel-1",
            transcriptChannelId: "transcripts-guild-1",
          },
        },
        "guild-2": {
          ticketConfig: {
            categoryId: "category-guild-2",
            supportRoleId: "support-guild-2",
            panelChannelId: "panel-2",
            transcriptChannelId: "transcripts-guild-2",
          },
        },
      }),
    )

    const secondGuild = createGuild("guild-2", "Second Support Server")
    const secondUser = createUser("user-2")
    const secondMessage = {
      ...message,
      author: secondUser,
      content: "Please help me choose a server.",
    }

    await handleTicketDirectMessage(secondMessage)
    const selection = directMessages.at(-1)
    assert.equal(
      selection.components[0].components[0].data.custom_id,
      "ticket:dm-server",
    )

    const interactionUpdates = []
    const selectInteraction = {
      customId: "ticket:dm-server",
      values: ["guild-2"],
      user: {
        ...secondUser,
        createDM: async () => message.channel,
      },
      client,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isModalSubmit: () => false,
      update: async (payload) => interactionUpdates.push(payload),
    }

    await handleTicketInteraction(selectInteraction)
    tickets = JSON.parse(
      await readFile(path.join(directory, "tickets.json"), "utf8"),
    )
    const secondTicket = Object.values(tickets.tickets).find(
      (record) => record.ownerId === "user-2",
    )
    assert.equal(secondTicket.guildId, secondGuild.id)
    assert.equal(secondTicket.supportRoleId, "support-guild-2")
    assert.equal(secondTicket.transcriptChannelId, "transcripts-guild-2")
    assert.equal(interactionUpdates.length, 1)
    assert.match(interactionUpdates[0].content, /Second Support Server/)
    assert.equal(notifications.length, 2)
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR
    } else {
      process.env.DATA_DIR = previousDataDir
    }

    await rm(directory, { recursive: true, force: true })
  }
})

function createUser(id) {
  return {
    id,
    tag: `${id}#0001`,
    username: id,
    displayAvatarURL: () => "https://example.test/avatar.png",
    createDM: async () => ({ send: async () => {} }),
  }
}
