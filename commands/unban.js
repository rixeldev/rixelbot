import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

import { logModerationAction } from "../handlers/moderationLogs.js"

const userIdPattern = /^\d{17,20}$/
const unknownBanCode = 10026

async function unbanMember({ guild, client, moderator, userId, reason }) {
  if (!userIdPattern.test(userId)) {
    return { error: "Provide a valid Discord user ID." }
  }

  const botMember = guild.members.me || (await guild.members.fetchMe())
  if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
    return { error: "I do not have permission to unban members." }
  }

  let ban
  try {
    ban = await guild.bans.fetch(userId)
  } catch (error) {
    if (error.code === unknownBanCode) {
      return { error: "That user is not banned from this server." }
    }
    throw error
  }

  const unbannedUser = await guild.members.unban(
    userId,
    `${reason} | Moderator: ${moderator.tag}`,
  )

  await logModerationAction(client, {
    guild,
    action: "UNBAN",
    target: unbannedUser || ban.user,
    moderator,
    reason,
  })

  return { user: unbannedUser || ban.user }
}

export default {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unbans a user by their Discord ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) =>
      option
        .setName("user_id")
        .setDescription("Discord user ID of the banned user.")
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for removing the ban.")
        .setMaxLength(500),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        content: "You need Ban Members permission to unban users.",
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    const result = await unbanMember({
      guild: interaction.guild,
      client: interaction.client,
      moderator: interaction.user,
      userId: interaction.options.getString("user_id").trim(),
      reason:
        interaction.options.getString("reason") || "No reason provided.",
    })

    return interaction.editReply(
      result.error
        ? `❌ ${result.error}`
        : `✅ ${result.user.tag} has been unbanned.`,
    )
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ You need Ban Members permission to unban users.")
    }

    const userId = args[0]
    if (!userId) {
      return message.reply("Usage: `r!unban <user_id> [reason]`")
    }

    const result = await unbanMember({
      guild: message.guild,
      client: message.client,
      moderator: message.author,
      userId,
      reason: args.slice(1).join(" ") || "No reason provided.",
    })

    return message.reply(
      result.error
        ? `❌ ${result.error}`
        : `✅ ${result.user.tag} has been unbanned.`,
    )
  },
}
