import {
  handleTicketDirectMessage,
  handleTicketGuildMessage,
} from "../systems/tickets.js"
import { handleGuildMessageGuard } from "../systems/autoModeration.js"
import { recordAuditEvent } from "../handlers/auditLog.js"
import { checkCommandRateLimit } from "../handlers/commandRateLimit.js"

export function registerMessageHandler(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return

    if (!message.guild) {
      try {
        await handleTicketDirectMessage(message)
      } catch (error) {
        console.error("Error handling direct-message ticket:", error)
        await message.channel
          .send("I could not process that support message. Please try again later.")
          .catch((sendError) =>
            console.error("Could not send direct-message error:", sendError),
          )
      }
      return
    }

    try {
      if (await handleGuildMessageGuard(message)) return
    } catch (error) {
      console.error("Error handling automatic message protection:", error)
    }

    try {
      if (await handleTicketGuildMessage(message)) return
    } catch (error) {
      console.error("Error handling ticket channel message:", error)
      await message.channel
        .send("I could not process that ticket message. Please try again later.")
        .catch((sendError) =>
          console.error("Could not send ticket message error:", sendError),
        )
      return
    }

    const prefix = process.env.PREFIX || "r!"

    // Check the prefix
    if (!message.content.startsWith(prefix)) return

    // Separate command and arguments
    const args = message.content.slice(prefix.length).trim().split(/\s+/)

    const commandName = args.shift()?.toLowerCase()

    if (!commandName) return

    const command = client.commands.get(commandName)

    if (!command || typeof command.executePrefix !== "function") return

    const rate = checkCommandRateLimit({
      guildId: message.guildId,
      userId: message.author.id,
    })

    if (!rate.allowed) {
      recordAuditEvent({
        type: "command",
        source: "prefix",
        command: commandName,
        outcome: "rate-limited",
        userId: message.author.id,
        guildId: message.guildId,
        channelId: message.channelId,
      })

      await message
        .reply(
          `⏳ Too many commands. Try again in ${Math.ceil(
            rate.retryAfterMs / 1000,
          )}s.`,
        )
        .catch(console.error)
      return
    }

    const auditEvent = {
      type: "command",
      source: "prefix",
      command: commandName,
      userId: message.author.id,
      guildId: message.guildId,
      channelId: message.channelId,
    }

    try {
      await command.executePrefix(message, args)

      recordAuditEvent({ ...auditEvent, outcome: "success" })
    } catch (error) {
      console.error(`Error in command ${commandName}:`, error)

      recordAuditEvent({ ...auditEvent, outcome: "error" })

      await message.reply("❌ An error occurred while executing this command.")
    }
  })
}
