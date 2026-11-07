import "dotenv/config"

import {
  Client,
  GatewayIntentBits,
  Collection,
  Partials,
} from "discord.js"

import { loadCommands } from "./handlers/commandHandler.js"
import { registerEvents } from "./events/ready.js"
import { registerInteractionHandler } from "./events/interactionCreate.js"
import { registerMessageHandler } from "./events/messageCreate.js"
import registerVoiceStateUpdate from "./events/voiceStateUpdate.js"
import { cleanupTemporaryChannels } from "./systems/temporaryVoice.js"
import { startHealthServer } from "./systems/healthServer.js"
import { initializeDataDirectory } from "./handlers/dataDirectory.js"
import registerGuildMemberAdd from "./events/guildMemberAdd.js"

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
})

client.commands = new Collection()

let closePromise

function closeResources(healthServer) {
  if (closePromise) return closePromise

  client.destroy()

  if (!healthServer?.listening) return Promise.resolve()

  closePromise = new Promise((resolve, reject) => {
    healthServer.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })

  return closePromise
}

async function startBot() {
  let healthServer

  try {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error("DISCORD_TOKEN is missing")
    }

    await initializeDataDirectory()
    await loadCommands(client)

    registerEvents(client)
    registerInteractionHandler(client)
    registerMessageHandler(client)
    registerVoiceStateUpdate(client)
    registerGuildMemberAdd(client)

    healthServer = await startHealthServer({
      isReady: () => client.isReady(),
    })
    console.log("HTTP health-check server listening")

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => {
        console.log(`Received ${signal}; shutting down`)
        closeResources(healthServer).catch((error) => {
          console.error("Error during shutdown:", error)
          process.exitCode = 1
        })
      })
    }

    await cleanupTemporaryChannels(client)
    await client.login(process.env.DISCORD_TOKEN)
  } catch (error) {
    console.error("Error starting bot:", error)
    try {
      await closeResources(healthServer)
    } catch (shutdownError) {
      console.error("Error closing services after startup failure:", shutdownError)
    }
    process.exitCode = 1
  }
}

startBot()
