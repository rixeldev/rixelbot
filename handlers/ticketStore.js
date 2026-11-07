import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"

import path from "node:path"
import { dataDirectory } from "./dataDirectory.js"

const databasePath = path.join(dataDirectory, "tickets.json")

let writeQueue = Promise.resolve()

async function readDatabase() {
  await mkdir(dataDirectory, { recursive: true })

  try {
    return JSON.parse(await readFile(databasePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return { tickets: {} }
    throw error
  }
}

async function writeDatabase(database) {
  const temporaryPath = `${databasePath}.${randomUUID()}.tmp`

  try {
    await writeFile(temporaryPath, JSON.stringify(database, null, 2), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    })
    await rename(temporaryPath, databasePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function updateDatabase(callback) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase()
    const result = await callback(database)
    await writeDatabase(database)
    return result
  })

  writeQueue = operation.catch(() => {})
  return operation
}

export async function createTicketRecord(ticket) {
  return updateDatabase((database) => {
    const existing = Object.values(database.tickets).find(
      (record) =>
        record.ownerId === ticket.ownerId && record.status === "open",
    )

    if (existing) {
      const error = new Error("This user already has an open ticket")
      error.code = "TICKET_ALREADY_OPEN"
      error.ticket = existing
      throw error
    }

    if (database.tickets[ticket.channelId]) {
      throw new Error(`Ticket already exists for channel ${ticket.channelId}`)
    }

    database.tickets[ticket.channelId] = {
      ...ticket,
      status: "open",
      claimedBy: null,
      createdAt: new Date().toISOString(),
      closedAt: null,
    }

    return database.tickets[ticket.channelId]
  })
}

export async function getTicketByChannel(channelId) {
  await writeQueue
  const database = await readDatabase()
  return database.tickets[channelId] || null
}

export async function getTicketsForGuild(guildId) {
  await writeQueue
  const database = await readDatabase()

  return Object.fromEntries(
    Object.entries(database.tickets).filter(
      ([, ticket]) => ticket.guildId === guildId,
    ),
  )
}

export async function getOpenTicketByUser(ownerId) {
  await writeQueue
  const database = await readDatabase()

  return (
    Object.values(database.tickets).find(
      (ticket) => ticket.ownerId === ownerId && ticket.status === "open",
    ) || null
  )
}

export async function updateTicket(channelId, updates) {
  return updateDatabase((database) => {
    const ticket = database.tickets[channelId]
    if (!ticket) throw new Error(`Ticket not found for channel ${channelId}`)

    Object.assign(ticket, updates)
    return ticket
  })
}

export async function deleteTicketRecord(channelId) {
  return updateDatabase((database) => {
    delete database.tickets[channelId]
  })
}
