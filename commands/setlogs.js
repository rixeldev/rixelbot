import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js"

import { setLogChannel } from "../handlers/guildConfigStore.js"

export default {
  data: new SlashCommandBuilder()
    .setName("setlogs")
    .setDescription("Sets the moderation log channel. (Administration only)")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel for moderation logs.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ You need Manage Server permission.",
        ephemeral: true,
      })
    }

    const channel = interaction.options.getChannel("channel")

    await setLogChannel(interaction.guild.id, channel.id)

    await interaction.reply({
      content: `✅ Moderation logs configured in ${channel}.`,
      ephemeral: true,
    })
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply("❌ You need Manage Server permission.")
    }

    const channelId = args[0]?.match(/^<#(\d+)>$/)?.[1]

    if (!channelId) {
      return message.reply("Usage: `r!setlogs #channel`")
    }

    const channel = await message.guild.channels
      .fetch(channelId)
      .catch(() => null)

    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply("❌ Please provide a valid text channel.")
    }

    await setLogChannel(message.guild.id, channel.id)

    await message.reply(`✅ Moderation logs configured in ${channel}.`)
  },
}
