import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js"
import { logModerationAction } from "../handlers/moderationLogs.js"

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kicks a member from the server. (Administration only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to kick.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for the kick.")
        .setMaxLength(500)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user")
    const reason =
      interaction.options.getString("reason") || "No reason provided."

    const target = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null)

    if (!target) {
      return interaction.reply({
        content: "❌ This member is not in the server.",
        ephemeral: true,
      })
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        content: "❌ You do not have permission to kick members.",
        ephemeral: true,
      })
    }

    if (
      !interaction.guild.members.me.permissions.has(
        PermissionFlagsBits.KickMembers,
      )
    ) {
      return interaction.reply({
        content: "❌ I do not have permission to kick members.",
        ephemeral: true,
      })
    }

    if (!target.kickable) {
      return interaction.reply({
        content: "❌ I cannot kick this member. Check role hierarchy.",
        ephemeral: true,
      })
    }

    if (target.id === interaction.user.id) {
      return interaction.reply({
        content: "❌ You cannot kick yourself.",
        ephemeral: true,
      })
    }

    await target.kick(`${reason} | Moderator: ${interaction.user.tag}`)

    await logModerationAction(message.client, {
      guild: message.guild,
      action: "KICK",
      target: target.user,
      moderator: message.author,
      reason,
    })

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("👢 Member Kicked")
      .addFields(
        {
          name: "Member",
          value: `${target.user.tag}`,
          inline: true,
        },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        },
        {
          name: "Reason",
          value: reason,
        },
      )
      .setTimestamp()

    await interaction.reply({
      embeds: [embed],
    })
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply("❌ You do not have permission to kick members.")
    }

    if (
      !message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)
    ) {
      return message.reply("❌ I do not have permission to kick members.")
    }

    const mention = args[0]?.match(/^<@!?(\d+)>$/)
    const targetId = mention?.[1] || args[0]

    if (!targetId) {
      return message.reply("Usage: `r!kick @user [reason]`")
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null)

    if (!target) {
      return message.reply("❌ Member not found.")
    }

    if (target.id === message.author.id) {
      return message.reply("❌ You cannot kick yourself.")
    }

    if (!target.kickable) {
      return message.reply(
        "❌ I cannot kick this member. Check role hierarchy.",
      )
    }

    const reason = args.slice(1).join(" ") || "No reason provided."

    await target.kick(`${reason} | Moderator: ${message.author.tag}`)

    await logModerationAction(message.client, {
      guild: message.guild,
      action: "KICK",
      target: target.user,
      moderator: message.author,
      reason,
    })

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("👢 Member Kicked")
      .addFields(
        {
          name: "Member",
          value: `${target.user.tag}`,
          inline: true,
        },
        {
          name: "Moderator",
          value: `${message.author.tag}`,
          inline: true,
        },
        {
          name: "Reason",
          value: reason,
        },
      )
      .setTimestamp()

    await message.reply({
      embeds: [embed],
    })
  },
}
