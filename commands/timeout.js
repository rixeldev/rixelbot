import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js"
import { logModerationAction } from "../handlers/moderationLogs.js"
import { checkModeration } from "../handlers/moderationUtils.js"

function parseDuration(input) {
  const match = input.match(/^(\d+)(s|m|h|d)$/i)

  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null
  }

  const multipliers = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  }

  const duration = amount * multipliers[unit]

  if (!Number.isSafeInteger(duration) || duration > 28 * 86400000) {
    return null
  }

  return duration
}

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily restricts a member. (Administration only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to timeout.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration: 30s, 10m, 2h, 1d.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the timeout.")
        .setMaxLength(500),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply()

    const user = interaction.options.getUser("user")
    const durationInput = interaction.options.getString("duration")
    const reason =
      interaction.options.getString("reason") || "No reason provided."

    const duration = parseDuration(durationInput)

    if (!duration) {
      return interaction.editReply(
        "❌ Invalid duration. Use 30s, 10m, 2h or 1d. Maximum: 28d.",
      )
    }

    const result = await checkModeration({
      guild: interaction.guild,
      moderatorId: interaction.user.id,
      targetId: user.id,
      permission: PermissionFlagsBits.ModerateMembers,
    })

    if (result.error) {
      return interaction.editReply(result.error)
    }

    if (!result.target.moderatable) {
      return interaction.editReply(
        "❌ I cannot timeout this member. Check role hierarchy.",
      )
    }

    await result.target.timeout(
      duration,
      `${reason} | Moderator: ${interaction.user.tag}`,
    )

    await logModerationAction(message.client, {
      guild: message.guild,
      action: "TIMEOUT",
      target: result.target.user,
      moderator: message.author,
      reason,
      duration: args[1],
    })

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🔇 Member Timed Out")
      .addFields(
        { name: "Member", value: user.tag, inline: true },
        { name: "Duration", value: durationInput, inline: true },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason", value: reason },
      )
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  },

  async executePrefix(message, args) {
    const targetId = args[0]?.match(/^<@!?(\d+)>$/)?.[1] || args[0]

    if (!targetId || !args[1]) {
      return message.reply("Usage: `r!timeout @user 10m [reason]`")
    }

    const duration = parseDuration(args[1])

    if (!duration) {
      return message.reply(
        "❌ Invalid duration. Use 30s, 10m, 2h or 1d. Maximum: 28d.",
      )
    }

    const reason = args.slice(2).join(" ") || "No reason provided."

    const result = await checkModeration({
      guild: message.guild,
      moderatorId: message.author.id,
      targetId,
      permission: PermissionFlagsBits.ModerateMembers,
    })

    if (result.error) {
      return message.reply(result.error)
    }

    if (!result.target.moderatable) {
      return message.reply(
        "❌ I cannot timeout this member. Check role hierarchy.",
      )
    }

    await result.target.timeout(
      duration,
      `${reason} | Moderator: ${message.author.tag}`,
    )

    await logModerationAction(message.client, {
      guild: message.guild,
      action: "TIMEOUT",
      target: result.target.user,
      moderator: message.author,
      reason,
      duration: args[1],
    })

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🔇 Member Timed Out")
      .addFields(
        { name: "Member", value: result.target.user.tag, inline: true },
        { name: "Duration", value: args[1], inline: true },
        { name: "Moderator", value: message.author.tag },
        { name: "Reason", value: reason },
      )
      .setTimestamp()

    await message.reply({ embeds: [embed] })
  },
}
