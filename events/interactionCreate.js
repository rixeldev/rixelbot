import { handleTemporaryVoiceInteraction } from "../systems/temporaryVoice.js"
import { handleTicketInteraction } from "../systems/tickets.js"

export function registerInteractionHandler(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      const ticketHandled = await handleTicketInteraction(interaction)
      if (ticketHandled) return

      // Handle temporary voice buttons and modals first.
      const handled = await handleTemporaryVoiceInteraction(interaction)
      if (handled) return

      // Continue only with slash commands.
      if (!interaction.isChatInputCommand()) return

      const command = client.commands.get(interaction.commandName)

      if (!command) {
        console.warn(`Unknown command: ${interaction.commandName}`)
        return
      }

      await command.execute(interaction)
    } catch (error) {
      console.error("Error handling interaction:", error)

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
