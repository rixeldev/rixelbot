import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

import { setAutoRoleConfig } from "../handlers/guildConfigStore.js"

const restrictedRolePermissions = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.ManageEvents,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.MentionEveryone,
]

export default {
  data: new SlashCommandBuilder()
    .setName("autorole-setup")
    .setDescription("Configure the role assigned to new members.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Basic member role; omit this option to disable auto-role."),
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
        content: "You need Manage Server permission to configure auto-roles.",
        ephemeral: true,
      })
    }

    const role = interaction.options.getRole("role")
    if (!role) {
      await setAutoRoleConfig(interaction.guildId, null)
      return interaction.reply({
        content: "Automatic role assignment has been disabled.",
        ephemeral: true,
      })
    }

    if (
      role.id === interaction.guild.roles.everyone.id ||
      role.managed
    ) {
      return interaction.reply({
        content: "Choose a regular server role that is not @everyone or managed by an integration.",
        ephemeral: true,
      })
    }

    if (restrictedRolePermissions.some((permission) => role.permissions.has(permission))) {
      return interaction.reply({
        content: "For safety, the automatic role cannot grant administrative, moderation, or server-management permissions.",
        ephemeral: true,
      })
    }

    const botMember =
      interaction.guild.members.me ||
      (await interaction.guild.members.fetchMe())

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "The bot needs Manage Roles permission to assign the selected role.",
        ephemeral: true,
      })
    }

    if (!role.editable) {
      return interaction.reply({
        content: "Move the bot's highest role above the selected role, then try again.",
        ephemeral: true,
      })
    }

    await setAutoRoleConfig(interaction.guildId, role.id)
    return interaction.reply({
      content: `New human members will receive the ${role} role. Omit the role option in this command to disable auto-role.`,
      ephemeral: true,
    })
  },
}
