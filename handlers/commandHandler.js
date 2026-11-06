import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function loadCommands(client) {
  const commandsPath = path.join(__dirname, "../commands")

  const commandFiles = await readdir(commandsPath)

  for (const file of commandFiles) {
    if (!file.endsWith(".js")) continue

    const filePath = path.join(commandsPath, file)

    const command = await import(pathToFileURL(filePath).href)

    const commandData = command.default

    client.commands.set(commandData.data.name, commandData)

    console.log(`Command loaded: ${commandData.data.name}`)
  }
}
