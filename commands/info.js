import { SlashCommandBuilder, EmbedBuilder } from "discord.js"

function formatUptime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000)

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`
}

function createInfoEmbed(client) {
  const uptime = formatUptime(client.uptime ?? 0)

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: "RixelBot | Information",
      iconURL: client.user.displayAvatarURL(),
    })
    .setTitle("🤖 Meet RixelBot")
    .setDescription("Your personalized Discord assistant.")
    .addFields(
      {
        name: "📡 Status",
        value: "🟢 Operational",
        inline: true,
      },
      {
        name: "🏓 Latency",
        value: `${client.ws.ping} ms`,
        inline: true,
      },
      {
        name: "⏱️ Uptime",
        value: uptime,
        inline: true,
      },
      {
        name: "🌐 Servers",
        value: `${client.guilds.cache.size}`,
        inline: true,
      },
      {
        name: "📦 Library",
        value: "Discord.js",
        inline: true,
      },
      {
        name: "⚙️ Commands",
        value: `${client.commands.size}`,
        inline: true,
      },
    )
    .setThumbnail(client.user.displayAvatarURL())
    .setFooter({
      text: "RixelBot • Developed with Node.js",
    })
    .setTimestamp()

  return embed
}

export default {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Shows information about RixelBot."),

  async execute(interaction) {
    const embed = createInfoEmbed(interaction.client)

    await interaction.reply({
      embeds: [embed],
    })
  },

  async executePrefix(message) {
    const embed = createInfoEmbed(message.client)

    await message.reply({
      embeds: [embed],
    })
  },
}
