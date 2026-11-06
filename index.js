import "dotenv/config"

import { Client, GatewayIntentBits, Collection } from "discord.js"

import { loadCommands } from "./handlers/commandHandler.js"
import { registerEvents } from "./events/ready.js"
import { registerInteractionHandler } from "./events/interactionCreate.js"
import { registerMessageHandler } from "./events/messageCreate.js"
import registerVoiceStateUpdate from "./events/voiceStateUpdate.js"
import { cleanupTemporaryChannels } from "./systems/temporaryVoice.js"

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
  ],
})

client.commands = new Collection()

async function startBot() {
  try {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error("DISCORD_TOKEN is missing from .env")
    }

    await loadCommands(client)

    registerEvents(client)
    registerInteractionHandler(client)
    registerMessageHandler(client)
    registerVoiceStateUpdate(client)

    await cleanupTemporaryChannels(client)
    await client.login(process.env.DISCORD_TOKEN)
  } catch (error) {
    console.error("Error starting bot:", error)
    process.exitCode = 1
  }
}

startBot()
