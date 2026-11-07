import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

test("ticket records serialize writes and enforce one open ticket per user", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rixelbot-tickets-"))
  const previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  try {
    const {
      createTicketRecord,
      getOpenTicketByUser,
      getTicketByChannel,
      updateTicket,
    } = await import(`../handlers/ticketStore.js?test=${Date.now()}`)

    const makeTicket = (channelId) => ({
      channelId,
      guildId: "guild-1",
      categoryId: "category-1",
      supportRoleId: "support-1",
      transcriptChannelId: "transcripts-1",
      ownerId: "user-1",
      ownerTag: "member",
      subject: "Help",
      details: "Need support",
      source: "panel",
    })

    const results = await Promise.allSettled([
      createTicketRecord(makeTicket("channel-1")),
      createTicketRecord(makeTicket("channel-2")),
    ])

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
    assert.equal(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason.code === "TICKET_ALREADY_OPEN",
      ).length,
      1,
    )

    const ticket = await getOpenTicketByUser("user-1")
    assert.equal(ticket.status, "open")
    assert.equal((await getTicketByChannel(ticket.channelId)).ownerId, "user-1")

    await updateTicket(ticket.channelId, { status: "closed" })
    assert.equal(await getOpenTicketByUser("user-1"), null)

    const database = JSON.parse(
      await readFile(path.join(directory, "tickets.json"), "utf8"),
    )
    assert.equal(database.tickets[ticket.channelId].status, "closed")
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR
    } else {
      process.env.DATA_DIR = previousDataDir
    }

    await rm(directory, { recursive: true, force: true })
  }
})
