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

export async function setTicketConfig(guildId, ticketConfig) {
  return updateConfig((config) => {
    config[guildId] ??= {}
    config[guildId].ticketConfig = { ...ticketConfig }
  })
}

export async function setGuardConfig(guildId, guardConfig) {
  return updateConfig((config) => {
    config[guildId] ??= {}
    config[guildId].guardConfig = { ...guardConfig }
  })
}

export async function setAutoRoleConfig(guildId, roleId) {
  return updateConfig((config) => {
    config[guildId] ??= {}

    if (roleId) {
      config[guildId].autoRoleConfig = { roleId }
    } else {
      delete config[guildId].autoRoleConfig
    }
  })
}

export async function setRolePanelConfig(guildId, messageId, panelConfig) {
  return updateConfig((config) => {
    config[guildId] ??= {}
    config[guildId].rolePanels ??= {}
    config[guildId].rolePanels[messageId] = {
      channelId: panelConfig.channelId,
      roles: { ...panelConfig.roles },
    }
  })
}

export async function removeRolePanelConfig(guildId, messageId) {
  return updateConfig((config) => {
    const rolePanels = config[guildId]?.rolePanels
    if (!rolePanels) return

    delete rolePanels[messageId]
    if (Object.keys(rolePanels).length === 0) {
      delete config[guildId].rolePanels
    }
  })
}

export async function setMemberMessagesConfig(guildId, memberMessages) {
  return updateConfig((config) => {
    config[guildId] ??= {}

    const updatedConfig = {
      ...config[guildId].memberMessages,
      ...memberMessages,
    }

    for (const [event, eventConfig] of Object.entries(updatedConfig)) {
      if (eventConfig === null) delete updatedConfig[event]
    }

    if (Object.keys(updatedConfig).length === 0) {
      delete config[guildId].memberMessages
    } else {
      config[guildId].memberMessages = updatedConfig
    }
  })
}

export async function getGuildConfig(guildId) {
  await writeQueue

  const config = await readConfig()

  return config[guildId] || {}
}

export async function getConfiguredTicketGuilds() {
  await writeQueue

  const config = await readConfig()

  return Object.entries(config)
    .filter(([, guildConfig]) => guildConfig.ticketConfig?.categoryId)
    .map(([guildId, guildConfig]) => ({
      guildId,
      ticketConfig: guildConfig.ticketConfig,
    }))
}
