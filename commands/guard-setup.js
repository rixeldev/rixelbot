import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"

import {
  getGuildConfig,
  setGuardConfig,
} from "../handlers/guildConfigStore.js"

const alertPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
]

const spamActions = [
  {
    name: "Alert only (no deletion)",
    value: "alert_only",
  },
  {
    name: "Delete spam and alert staff",
    value: "delete_alert",
  },
  {
    name: "Delete spam; timeout on repeat",
    value: "delete_timeout",
  },
]

export default {
  data: new SlashCommandBuilder()
    .setName("guard-setup")
    .setDescription("Configure spam and raid protection.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("alert_channel")
        .setDescription("Private staff channel for protection alerts.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("spam_protection")
        .setDescription("Detect message bursts and repeated messages.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("spam_action")
        .setDescription("Action taken when spam is detected.")
        .addChoices(...spamActions)
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("raid_detection")
        .setDescription("Alert staff about unusually fast member joins.")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("invite_filter")
        .setDescription("Remove Discord invite links from non-moderators.")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("spam_message_limit")
        .setDescription("Messages in the spam window before detection (3-15).")
        .setMinValue(3)
        .setMaxValue(15),
    )
    .addIntegerOption((option) =>
      option
        .setName("spam_window_seconds")
        .setDescription("Spam detection window in seconds (3-30).")
        .setMinValue(3)
        .setMaxValue(30),
    )
    .addIntegerOption((option) =>
      option
        .setName("mention_limit")
        .setDescription("Mentions in one message before detection (3-10).")
        .setMinValue(3)
        .setMaxValue(10),
    )
    .addIntegerOption((option) =>
      option
        .setName("raid_join_limit")
        .setDescription("Joins in the raid window before an alert (3-30).")
        .setMinValue(3)
        .setMaxValue(30),
    )
    .addIntegerOption((option) =>
      option
        .setName("raid_window_seconds")
        .setDescription("Raid detection window in seconds (5-60).")
        .setMinValue(5)
        .setMaxValue(60),
    )
    .addRoleOption((option) =>
      option
        .setName("bypass_role")
        .setDescription("Optional role exempt from spam/invite filtering."),
    )
    .addChannelOption((option) =>
      option
        .setName("ignored_channel")
        .setDescription("Optional channel exempt from spam/invite filtering.")
        .addChannelTypes(ChannelType.GuildText),
    )
    .addBooleanOption((option) =>
      option
        .setName("clear_exemptions")
        .setDescription("Clear the previously configured bypass role and channel."),
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
        content: "You need Manage Server permission to configure protection.",
        ephemeral: true,
      })
    }

    const alertChannel = interaction.options.getChannel("alert_channel")
    const spamProtectionEnabled =
      interaction.options.getBoolean("spam_protection")
    const spamAction = interaction.options.getString("spam_action")
    const raidDetectionEnabled =
      interaction.options.getBoolean("raid_detection")
    const inviteFilterEnabled = interaction.options.getBoolean("invite_filter")
    const botMember =
      interaction.guild.members.me ||
      (await interaction.guild.members.fetchMe())
    const missingPermissions = []
    const botAlertPermissions = alertChannel.permissionsFor(botMember)

    if (!botAlertPermissions?.has(alertPermissions)) {
      missingPermissions.push("View Channel and Send Messages in the alert channel")
    }

    if (
      alertChannel
        .permissionsFor(interaction.guild.roles.everyone)
        ?.has(PermissionFlagsBits.ViewChannel)
    ) {
      return interaction.reply({
        content: "The alert channel must be private so protection alerts are staff-only.",
        ephemeral: true,
      })
    }

    if (
      (spamProtectionEnabled && spamAction !== "alert_only") ||
      inviteFilterEnabled
    ) {
      if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        missingPermissions.push("Manage Messages")
      }
    }

    if (
      spamProtectionEnabled &&
      spamAction === "delete_timeout" &&
      !botMember.permissions.has(PermissionFlagsBits.ModerateMembers)
    ) {
      missingPermissions.push("Moderate Members")
    }

    if (missingPermissions.length > 0) {
      return interaction.reply({
        content: `The bot is missing: ${missingPermissions.join("; ")}.`,
        ephemeral: true,
      })
    }

    const bypassRole = interaction.options.getRole("bypass_role")
    const ignoredChannel = interaction.options.getChannel("ignored_channel")
    const clearExemptions =
      interaction.options.getBoolean("clear_exemptions") ?? false
    const existingGuardConfig = (
      await getGuildConfig(interaction.guildId)
    ).guardConfig

    await setGuardConfig(interaction.guildId, {
      enabled:
        spamProtectionEnabled || raidDetectionEnabled || inviteFilterEnabled,
      alertChannelId: alertChannel.id,
      spamProtectionEnabled,
      spamAction,
      spamMessageLimit:
        interaction.options.getInteger("spam_message_limit") ??
        existingGuardConfig?.spamMessageLimit ??
        6,
      spamWindowSeconds:
        interaction.options.getInteger("spam_window_seconds") ??
        existingGuardConfig?.spamWindowSeconds ??
        8,
      mentionLimit:
        interaction.options.getInteger("mention_limit") ??
        existingGuardConfig?.mentionLimit ??
        5,
      raidDetectionEnabled,
      raidJoinLimit:
        interaction.options.getInteger("raid_join_limit") ??
        existingGuardConfig?.raidJoinLimit ??
        8,
      raidWindowSeconds:
        interaction.options.getInteger("raid_window_seconds") ??
        existingGuardConfig?.raidWindowSeconds ??
        10,
      inviteFilterEnabled,
      bypassRoleId: clearExemptions
        ? null
        : bypassRole?.id || existingGuardConfig?.bypassRoleId || null,
      ignoredChannelId:
        clearExemptions
          ? null
          : ignoredChannel?.id || existingGuardConfig?.ignoredChannelId || null,
    })

    await interaction.reply({
      content: [
        "Protection settings saved.",
        `Spam protection: ${spamProtectionEnabled ? spamAction.replaceAll("_", " ") : "off"}.`,
        `Mention limit: ${interaction.options.getInteger("mention_limit") ?? 5}.`,
        `Raid alerts: ${raidDetectionEnabled ? `on (${interaction.options.getInteger("raid_join_limit") ?? 8} joins/${interaction.options.getInteger("raid_window_seconds") ?? 10}s)` : "off"} (alerts only).`,
        `Invite filter: ${inviteFilterEnabled ? "on" : "off"}.`,
        `Bypass role: ${clearExemptions ? "none" : bypassRole || existingGuardConfig?.bypassRoleId || "none"}.`,
        `Ignored channel: ${clearExemptions ? "none" : ignoredChannel || existingGuardConfig?.ignoredChannelId || "none"}.`,
      ].join("\n"),
      ephemeral: true,
    })
  },
}
