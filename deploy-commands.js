import "dotenv/config"

import { REST, Routes } from "discord.js"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function deployCommands() {
  try {
    for (const variable of ["DISCORD_TOKEN", "CLIENT_ID"]) {
      if (!process.env[variable]) {
        throw new Error(`${variable} is required to deploy commands`)
      }
    }

    const guildIds = (process.env.GUILD_IDS || process.env.GUILD_ID || "")
      .split(",")
      .map((guildId) => guildId.trim())
      .filter(Boolean)

    if (guildIds.length === 0) {
      throw new Error("GUILD_ID or GUILD_IDS is required to deploy commands")
    }

    if (guildIds.some((guildId) => !/^\d+$/.test(guildId))) {
      throw new Error("GUILD_ID and GUILD_IDS must contain Discord server IDs")
    }

    const commands = []
    const commandsPath = path.join(__dirname, "commands")

    const commandFiles = await readdir(commandsPath)

    for (const file of commandFiles) {
      if (!file.endsWith(".js")) continue

      const filePath = path.join(commandsPath, file)
      const imported = await import(pathToFileURL(filePath).href)

      commands.push(imported.default.data.toJSON())
    }

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN)

    console.log("Registering commands...")

    for (const guildId of new Set(guildIds)) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands },
      )
      console.log(`Registered ${commands.length} command(s) in server ${guildId}.`)
    }

  } catch (error) {
    console.error("Error registering commands:", error)
    process.exitCode = 1
  }
}

deployCommands()
