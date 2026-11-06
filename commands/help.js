import { SlashCommandBuilder, EmbedBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Displays all available commands."),

  async execute(interaction) {
    const embed = this.createHelpEmbed(interaction.client)

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    })
  },

  async executePrefix(message) {
    const embed = this.createHelpEmbed(message.client)

    await message.reply({
      embeds: [embed],
    })
  },

  createHelpEmbed(client) {
    const commands = [...client.commands.values()]
    const prefix = process.env.PREFIX || "r!"

    const commandList = commands
      .map((command) => {
        const name = command.data.name
        const description = command.data.description

        return `\`${prefix}${name}\` • \`/${name}\`\n${description}`
      })
      .join("\n\n")

    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: "RixelBot | Help Center",
        iconURL: client.user.displayAvatarURL(),
      })
      .setTitle("📚 Available Commands")
      .setDescription(commandList || "No commands available.")
      .addFields({
        name: "⌨️ How to use commands",
        value: [
          `\`${prefix}command\` — Prefix commands`,
          "`/command` — Slash commands",
        ].join("\n"),
      })
      .setFooter({
        text: "RixelBot • Help System",
      })
      .setTimestamp()
  },
}
