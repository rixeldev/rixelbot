import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"

import {
  getGuildConfig,
  setTicketConfig,
} from "../handlers/guildConfigStore.js"
import { installTicketPanel } from "../systems/tickets.js"

const requiredPanelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
]

const requiredTranscriptPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
]

export default {
  data: new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Configure the support ticket system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("category")
        .setDescription("Category where private tickets will be created.")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("support_role")
        .setDescription("Role allowed to view and reply to tickets.")
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("panel_channel")
        .setDescription("Text channel where members can open tickets.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("transcript_channel")
        .setDescription("Private staff channel where closed transcripts are saved.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "You need Manage Server permission to configure tickets.",
        ephemeral: true,
      })
    }

    const category = interaction.options.getChannel("category")
    const supportRole = interaction.options.getRole("support_role")
    const panelChannel = interaction.options.getChannel("panel_channel")
    const transcriptChannel = interaction.options.getChannel("transcript_channel")

    if (supportRole.id === interaction.guild.roles.everyone.id) {
      return interaction.reply({
        content: "The support role cannot be @everyone.",
        ephemeral: true,
      })
    }

    if (
      transcriptChannel
        .permissionsFor(interaction.guild.roles.everyone)
        ?.has(PermissionFlagsBits.ViewChannel) ||
      !transcriptChannel.permissionsFor(supportRole)?.has(
        PermissionFlagsBits.ViewChannel,
      )
    ) {
      return interaction.reply({
        content: "The transcript channel must be private and visible to the support role.",
        ephemeral: true,
      })
    }

    const botMember =
      interaction.guild.members.me ||
      (await interaction.guild.members.fetchMe())
    const botPermissions = botMember.permissions
    const missingPermissions = [
      ...(!botPermissions.has(PermissionFlagsBits.ManageChannels)
        ? ["Manage Channels"]
        : []),
      ...(!panelChannel
        .permissionsFor(botMember)
        ?.has(requiredPanelPermissions)
        ? ["View Channel, Send Messages, and Embed Links in the panel channel"]
        : []),
      ...(!transcriptChannel
        .permissionsFor(botMember)
        ?.has(requiredTranscriptPermissions)
        ? ["View Channel, Send Messages, and Attach Files in the transcript channel"]
        : []),
    ]

    if (missingPermissions.length > 0) {
      return interaction.reply({
        content: `The bot is missing: ${missingPermissions.join("; ")}.`,
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    const existingConfig = await getGuildConfig(interaction.guildId)
    const ticketConfig = {
      categoryId: category.id,
      supportRoleId: supportRole.id,
      panelChannelId: panelChannel.id,
      transcriptChannelId: transcriptChannel.id,
    }

    const panelMessage = await installTicketPanel(
      panelChannel,
      existingConfig.ticketConfig?.panelChannelId === panelChannel.id
        ? existingConfig.ticketConfig.panelMessageId
        : undefined,
    )

    await setTicketConfig(interaction.guildId, {
      ...ticketConfig,
      panelMessageId: panelMessage.id,
    })

    await interaction.editReply(
      `Ticket system configured. Members can open tickets in ${panelChannel}, and closed transcripts will be saved in ${transcriptChannel}.`,
    )
  },
}
