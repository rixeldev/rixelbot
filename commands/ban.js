import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js"
import { logModerationAction } from "../handlers/moderationLogs.js"
import { checkModeration } from "../handlers/moderationUtils.js"

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bans a member from the server. (Administration only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to ban.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the ban.")
        .setMaxLength(500),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply()

    const user = interaction.options.getUser("user")
    const reason =
      interaction.options.getString("reason") || "No reason provided."

    const result = await checkModeration({
      guild: interaction.guild,
      moderatorId: interaction.user.id,
      targetId: user.id,
      permission: PermissionFlagsBits.BanMembers,
    })

    if (result.error) {
      return interaction.editReply(result.error)
    }

    if (!result.target.bannable) {
      return interaction.editReply(
        "❌ I cannot ban this member. Check role hierarchy.",
      )
    }

    await result.target.ban({
      reason: `${reason} | Moderator: ${interaction.user.tag}`,
    })

    await logModerationAction(interaction.client, {
      guild: interaction.guild,
      action: "BAN",
      target: result.target.user,
      moderator: interaction.user,
      reason,
    })

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔨 Member Banned")
      .addFields(
        { name: "Member", value: user.tag, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason },
      )
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  },

  async executePrefix(message, args) {
    const targetId = args[0]?.match(/^<@!?(\d+)>$/)?.[1] || args[0]

    if (!targetId) {
      return message.reply("Usage: `r!ban @user [reason]`")
    }

    const reason = args.slice(1).join(" ") || "No reason provided."

    const result = await checkModeration({
      guild: message.guild,
      moderatorId: message.author.id,
      targetId,
      permission: PermissionFlagsBits.BanMembers,
    })

    if (result.error) {
      return message.reply(result.error)
    }

    if (!result.target.bannable) {
      return message.reply("❌ I cannot ban this member. Check role hierarchy.")
    }

    await result.target.ban({
      reason: `${reason} | Moderator: ${message.author.tag}`,
    })

    await logModerationAction(message.client, {
      guild: message.guild,
      action: "BAN",
      target: result.target.user,
      moderator: message.author,
      reason,
    })

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔨 Member Banned")
      .addFields(
        { name: "Member", value: result.target.user.tag, inline: true },
        { name: "Moderator", value: message.author.tag, inline: true },
        { name: "Reason", value: reason },
      )
      .setTimestamp()

    await message.reply({ embeds: [embed] })
  },
}
