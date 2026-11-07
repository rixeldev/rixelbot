import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"

import {
  getGuildConfig,
  setMemberMessagesConfig,
} from "../handlers/guildConfigStore.js"

const channelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
]

const defaultMessages = {
  welcome: "Welcome {member} to {server}!",
  leave: "{member} has left {server}.",
}

const eventOptions = [
  {
    key: "welcome",
    label: "Welcome",
    channelOption: "welcome_channel",
    messageOption: "welcome_message",
    disableOption: "disable_welcome",
  },
  {
    key: "leave",
    label: "Leave",
    channelOption: "leave_channel",
    messageOption: "leave_message",
    disableOption: "disable_leave",
  },
]

export default {
  data: new SlashCommandBuilder()
    .setName("welcome-setup")
    .setDescription("Configure welcome and leave messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("welcome_channel")
        .setDescription("Channel for welcome messages.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option
        .setName("welcome_message")
        .setDescription("Use {member}, {server}, and {count} as placeholders.")
        .setMaxLength(1000),
    )
    .addChannelOption((option) =>
      option
        .setName("leave_channel")
        .setDescription("Channel for member departure messages.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) =>
      option
        .setName("leave_message")
        .setDescription("Use {member}, {server}, and {count} as placeholders.")
        .setMaxLength(1000),
    )
    .addBooleanOption((option) =>
      option
        .setName("disable_welcome")
        .setDescription("Disable welcome messages."),
    )
    .addBooleanOption((option) =>
      option
        .setName("disable_leave")
        .setDescription("Disable member departure messages."),
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
        content: "You need Manage Server permission to configure member messages.",
        ephemeral: true,
      })
    }

    const inputs = eventOptions.map((option) => ({
      ...option,
      channel: interaction.options.getChannel(option.channelOption),
      message: interaction.options.getString(option.messageOption),
      disabled: interaction.options.getBoolean(option.disableOption) ?? false,
    }))

    if (
      inputs.some(
        ({ disabled, channel, message }) => disabled && (channel || message),
      )
    ) {
      return interaction.reply({
        content: "Do not set a channel or message for an event you are disabling.",
        ephemeral: true,
      })
    }

    const hasChanges = inputs.some(
      ({ disabled, channel, message }) => disabled || channel || message,
    )
    if (!hasChanges) {
      return interaction.reply({
        content: "Set a channel or message, or choose an event to disable.",
        ephemeral: true,
      })
    }

    const existing = (await getGuildConfig(interaction.guildId)).memberMessages || {}
    const updates = {}
    const configuredEvents = []

    for (const input of inputs) {
      if (input.disabled) {
        updates[input.key] = null
        continue
      }

      if (!input.channel && !input.message) continue

      const current = existing[input.key]
      const channelId = input.channel?.id || current?.channelId
      if (!channelId) {
        return interaction.reply({
          content: `Choose a channel when setting the ${input.label.toLowerCase()} message for the first time.`,
          ephemeral: true,
        })
      }

      if (input.channel) {
        const botMember =
          interaction.guild.members.me ||
          (await interaction.guild.members.fetchMe())
        const permissions = input.channel.permissionsFor(botMember)
        if (!permissions?.has(channelPermissions)) {
          return interaction.reply({
            content: `The bot needs View Channel and Send Messages in the ${input.label.toLowerCase()} channel.`,
            ephemeral: true,
          })
        }
      }

      updates[input.key] = {
        channelId,
        content:
          input.message ?? current?.content ?? defaultMessages[input.key],
      }
      configuredEvents.push(input.label.toLowerCase())
    }

    await setMemberMessagesConfig(interaction.guildId, updates)

    const result = []
    if (configuredEvents.length) {
      result.push(`Configured ${configuredEvents.join(" and ")} messages.`)
    }
    if (inputs.some(({ disabled }) => disabled)) {
      result.push(
        `Disabled ${inputs
          .filter(({ disabled }) => disabled)
          .map(({ label }) => label.toLowerCase())
          .join(" and ")} messages.`,
      )
    }

    return interaction.reply({
      content: result.join(" "),
      ephemeral: true,
    })
  },
}
