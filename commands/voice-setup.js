import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js"

import { setGeneratorChannel } from "../systems/temporaryVoice.js"

export default {
  data: new SlashCommandBuilder()
    .setName("voice-setup")
    .setDescription("Configure the temporary voice channel system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Select the voice channel used to create rooms.")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice),
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel")

    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return interaction.reply({
        content: "Please select a valid voice channel.",
        ephemeral: true,
      })
    }

    setGeneratorChannel(interaction.guild.id, channel.id)

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Temporary Voice System Configured")
      .setDescription(
        `The temporary voice system is now active.\n\n` +
          `**Generator channel:** ${channel}\n\n` +
          `Members who join this channel will automatically receive their own temporary voice room.`,
      )
      .setFooter({
        text: "RixelBot • Temporary Voice System",
      })

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    })
  },
}
