import { mkdir, readFile, writeFile } from "node:fs/promises"

import path from "node:path"
import { dataDirectory } from "./dataDirectory.js"

const configPath = path.join(dataDirectory, "guild-config.json")

let writeQueue = Promise.resolve()

async function readConfig() {
  await mkdir(dataDirectory, { recursive: true })

  try {
    const content = await readFile(configPath, "utf8")
    return JSON.parse(content)
  } catch (error) {
    if (error.code === "ENOENT") return {}
    throw error
  }
}

async function updateConfig(callback) {
  const operation = writeQueue.then(async () => {
    const config = await readConfig()

    const result = callback(config)

    await writeFile(configPath, JSON.stringify(config, null, 4), "utf8")

    return result
  })

  writeQueue = operation.catch(() => {})

  return operation
}

export async function setLogChannel(guildId, channelId) {
  return updateConfig((config) => {
    config[guildId] ??= {}
    config[guildId].logChannelId = channelId
  })
}

export async function getGuildConfig(guildId) {
  await writeQueue

  const config = await readConfig()

  return config[guildId] || {}
}
