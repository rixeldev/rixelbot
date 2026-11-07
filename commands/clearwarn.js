import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

import { logModerationAction } from "../handlers/moderationLogs.js"
import { revokeWarning } from "../handlers/warningsStore.js"

export default {
  data: new SlashCommandBuilder()
    .setName("clearwarn")
    .setDescription("Revoke one warning while preserving its audit history.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member whose warning will be revoked.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("warning_id")
        .setDescription("The warning ID shown by /warnings.")
        .setRequired(true)
        .setMaxLength(32),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why the warning is being revoked.")
        .setMaxLength(500),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }

    if (
      !interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)
    ) {
      return interaction.reply({
        content: "You need Moderate Members permission to revoke warnings.",
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    const user = interaction.options.getUser("user")
    const warningId = interaction.options.getString("warning_id").trim()
    const reason =
      interaction.options.getString("reason") || "No reason provided."
    const warning = await revokeWarning(
      interaction.guildId,
      user.id,
      warningId,
      {
        moderatorId: interaction.user.id,
        reason,
      },
    )

    if (!warning) {
      return interaction.editReply(
        "No active warning with that ID was found for this user.",
      )
    }

    await logModerationAction(interaction.client, {
      guild: interaction.guild,
      action: "UNWARN",
      target: user,
      moderator: interaction.user,
      reason,
      warningId,
      warningReason: warning.reason,
    })

    return interaction.editReply(
      `Warning \`${warningId}\` was revoked for ${user.tag}. The warning remains in the history as revoked.`,
    )
  },
}
