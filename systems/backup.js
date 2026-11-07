import { getGuildConfig } from "../handlers/guildConfigStore.js"
import { getTicketsForGuild } from "../handlers/ticketStore.js"
import { getGuildWarnings } from "../handlers/warningsStore.js"
import { getTemporaryVoiceData } from "./temporaryVoice.js"

export const MAX_BACKUP_SIZE_BYTES = 8 * 1024 * 1024

export async function createGuildBackup(guild) {
  const [configuration, warnings, tickets, temporaryVoice] = await Promise.all([
    getGuildConfig(guild.id),
    getGuildWarnings(guild.id),
    getTicketsForGuild(guild.id),
    getTemporaryVoiceData(guild.id),
  ])

  const exportedAt = new Date().toISOString()
  const backup = {
    schemaVersion: 1,
    exportedAt,
    guild: {
      id: guild.id,
      name: guild.name,
    },
    data: {
      configuration,
      warnings,
      tickets,
      temporaryVoice,
    },
  }
  const buffer = Buffer.from(`${JSON.stringify(backup, null, 2)}\n`, "utf8")

  if (buffer.byteLength > MAX_BACKUP_SIZE_BYTES) {
    const sizeMiB = (buffer.byteLength / (1024 * 1024)).toFixed(2)
    throw new Error(
      `The backup is ${sizeMiB} MiB, which exceeds the ${MAX_BACKUP_SIZE_BYTES / (1024 * 1024)} MiB download limit.`,
    )
  }

  const date = exportedAt.slice(0, 10)
  return {
    buffer,
    fileName: `rixelbot-backup-${guild.id}-${date}.json`,
  }
}
