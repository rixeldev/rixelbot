import { handleTemporaryVoiceInteraction } from "../systems/temporaryVoice.js"
import { handleTicketInteraction } from "../systems/tickets.js"
import { recordAuditEvent } from "../handlers/auditLog.js"
import { checkCommandRateLimit } from "../handlers/commandRateLimit.js"

function auditBase(interaction, commandName, source, outcome) {
  return {
    type: "command",
    source,
    command: commandName,
    outcome,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  }
}

export function registerInteractionHandler(client) {
  client.on("interactionCreate", async (interaction) => {
    let commandName

    try {
      const ticketHandled = await handleTicketInteraction(interaction)
      if (ticketHandled) return

      // Handle temporary voice buttons and modals first.
      const handled = await handleTemporaryVoiceInteraction(interaction)
      if (handled) return

      // Continue only with slash commands.
      if (!interaction.isChatInputCommand()) return

      commandName = interaction.commandName

      const command = client.commands.get(commandName)

      if (!command) {
        console.warn(`Unknown command: ${commandName}`)
        return
      }

      const rate = checkCommandRateLimit({
        guildId: interaction.guildId,
        userId: interaction.user.id,
      })

      if (!rate.allowed) {
        recordAuditEvent(auditBase(interaction, commandName, "slash", "rate-limited"))

        await interaction.reply({
          content: `⏳ Too many commands. Try again in ${Math.ceil(
            rate.retryAfterMs / 1000,
          )}s.`,
          ephemeral: true,
        })
        return
      }

      await command.execute(interaction)

      recordAuditEvent(auditBase(interaction, commandName, "slash", "success"))
    } catch (error) {
      console.error("Error handling interaction:", error)

      if (commandName) {
        recordAuditEvent(auditBase(interaction, commandName, "slash", "error"))
      }

      const response = {
        content: "❌ An error occurred while executing this interaction.",
        ephemeral: true,
      }

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response).catch(console.error)
      } else {
        await interaction.reply(response).catch(console.error)
      }
    }
  })
}
