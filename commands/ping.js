import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Test if bot is working."),

  async execute(interaction) {
    const latency = interaction.client.ws.ping

    await interaction.reply({
      content: `🏓 ¡Pong! Latency: ${latency}ms`,
      ephemeral: true,
    })
  },

  async executePrefix(message) {
    const latency = message.client.ws.ping

    await message.reply(`🏓 ¡Pong! Latency: ${latency}ms`)
  },
}
