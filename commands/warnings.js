import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js"
import { getWarnings } from "../handlers/warningsStore.js"

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Displays a member warning history. (Administration only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to check.")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (
      !interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)
    ) {
      return interaction.reply({
        content: "❌ You do not have permission to view warnings.",
        ephemeral: true,
      })
    }

    const user = interaction.options.getUser("user")

    const warnings = await getWarnings(interaction.guild.id, user.id)

    const embed = this.createEmbed(user, warnings)

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    })
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ You do not have permission to view warnings.")
    }

    const targetId = args[0]?.match(/^<@!?(\d+)>$/)?.[1] || args[0]

    if (!targetId) {
      return message.reply("Usage: `r!warnings @user`")
    }

    const user = await message.client.users.fetch(targetId).catch(() => null)

    if (!user) {
      return message.reply("❌ User not found.")
    }

    const warnings = await getWarnings(message.guild.id, user.id)

    const embed = this.createEmbed(user, warnings)

    await message.reply({ embeds: [embed] })
  },

  createEmbed(user, warnings) {
    const latestWarnings = warnings.slice(-10).reverse()

    const description = latestWarnings.length
      ? latestWarnings
          .map((warning, index) => {
            return [
              `**${index + 1}. Warning ID:** \`${warning.id}\`${warning.revokedAt ? " (REVOKED)" : ""}`,
              `**Reason:** ${warning.reason}`,
              `**Moderator:** <@${warning.moderatorId}>`,
              `**Date:** <t:${Math.floor(new Date(warning.timestamp).getTime() / 1000)}:f>`,
              ...(warning.revokedAt
                ? [
                    `**Revoked by:** <@${warning.revokedBy}>`,
                    `**Revocation reason:** ${warning.revocationReason}`,
                  ]
                : []),
            ].join("\n")
          })
          .join("\n\n")
      : "This member has no recorded warnings."

    const activeWarningCount = warnings.filter(
      (warning) => !warning.revokedAt,
    ).length

    return new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("📋 Warning History")
      .setDescription(description.slice(0, 4000))
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        {
          name: "Active Warnings",
          value: `${activeWarningCount}`,
          inline: true,
        },
        {
          name: "Revoked Warnings",
          value: `${warnings.length - activeWarningCount}`,
          inline: true,
        },
      )
      .setFooter({
        text: `RixelBot • ${user.tag}`,
      })
      .setTimestamp()
  },
}
