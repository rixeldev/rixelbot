import { mkdir, readFile, writeFile } from "node:fs/promises"

import path from "node:path"
import { dataDirectory } from "./dataDirectory.js"

const databasePath = path.join(dataDirectory, "warnings.json")

let writeQueue = Promise.resolve()

async function readDatabase() {
  await mkdir(dataDirectory, { recursive: true })

  try {
    const content = await readFile(databasePath, "utf8")
    return JSON.parse(content)
  } catch (error) {
    if (error.code === "ENOENT") {
      return {}
    }

    throw error
  }
}

async function updateDatabase(callback) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase()

    const result = await callback(database)

    await writeFile(databasePath, JSON.stringify(database, null, 4), "utf8")

    return result
  })

  writeQueue = operation.catch(() => {})

  return operation
}

export async function addWarning(guildId, userId, warning) {
  return updateDatabase((database) => {
    if (!database[guildId]) {
      database[guildId] = {}
    }

    if (!database[guildId][userId]) {
      database[guildId][userId] = []
    }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      moderatorId: warning.moderatorId,
      reason: warning.reason,
      timestamp: new Date().toISOString(),
    }

    database[guildId][userId].push(entry)

    return entry
  })
}

export async function getWarnings(guildId, userId) {
  await writeQueue

  const database = await readDatabase()

  return database[guildId]?.[userId] || []
}
