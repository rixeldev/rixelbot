import "dotenv/config"

import { REST, Routes } from "discord.js"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function deployCommands() {
  try {
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

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    )

    console.log(`✅ ${commands.length} command(s) registered!`)
  } catch (error) {
    console.error("Error registering commands:", error)
  }
}

deployCommands()
