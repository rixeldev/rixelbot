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
import { isTransientNetworkError } from "./handlers/networkErrors.js"
import registerGuildMemberAdd from "./events/guildMemberAdd.js"
import registerGuildMemberRemove from "./events/guildMemberRemove.js"
import registerReactionRoleEvents from "./events/reactionRole.js"
import { registerGatewayNotifications } from "./systems/gatewayNotifications.js"

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
})

client.commands = new Collection()

let closePromise
let shuttingDown = false

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Logs in to Discord, retrying transient DNS/network failures (common right
 * after boot) instead of exiting and relying on systemd to restart the unit.
 */
async function loginWithRetry(token) {
  let delayMs = 2_000

  for (;;) {
    try {
      await client.login(token)
      return
    } catch (error) {
      if (shuttingDown || !isTransientNetworkError(error)) throw error

      console.error(
        `Discord login failed (${error.code || error.message}); retrying in ${Math.round(delayMs / 1000)}s`,
      )

      await sleep(delayMs)
      delayMs = Math.min(delayMs * 2, 30_000)
    }
  }
}

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

    if (!process.env.ALERT_WEBHOOK_URL) {
      console.warn(
        "ALERT_WEBHOOK_URL is not set; alerts will only be written to the journal",
      )
    }

    registerEvents(client)
    registerInteractionHandler(client)
    registerMessageHandler(client)
    registerVoiceStateUpdate(client)
    registerGuildMemberAdd(client)
    registerGuildMemberRemove(client)
    registerReactionRoleEvents(client)
    registerGatewayNotifications(client)

    healthServer = await startHealthServer({
      isReady: () => client.isReady(),
    })
    console.log("HTTP health-check server listening")

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => {
        shuttingDown = true
        console.log(`Received ${signal}; shutting down`)
        closeResources(healthServer).catch((error) => {
          console.error("Error during shutdown:", error)
          process.exitCode = 1
        })
      })
    }

    await cleanupTemporaryChannels(client)
    await loginWithRetry(process.env.DISCORD_TOKEN)
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
