import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"

import {
  removeRolePanelConfig,
  setRolePanelConfig,
} from "../handlers/guildConfigStore.js"
import {
  hasReactionPanelPermissions,
  isCosmeticRole,
} from "../systems/reactionRoles.js"

const panelOptions = [
  {
    role: "role_1",
    emoji: "emoji_1",
  },
  {
    role: "role_2",
    emoji: "emoji_2",
  },
  {
    role: "role_3",
    emoji: "emoji_3",
  },
  {
    role: "role_4",
    emoji: "emoji_4",
  },
  {
    role: "role_5",
    emoji: "emoji_5",
  },
  {
    role: "role_6",
    emoji: "emoji_6",
  },
  {
    role: "role_7",
    emoji: "emoji_7",
  },
  {
    role: "role_8",
    emoji: "emoji_8",
  },
  {
    role: "role_9",
    emoji: "emoji_9",
  },
  {
    role: "role_10",
    emoji: "emoji_10",
  },
]

const unicodeEmojiPattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u

export function isSingleUnicodeEmoji(value) {
  if (!value || !unicodeEmojiPattern.test(value)) return false

  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)]
  return segments.length === 1
}

export default {
  data: new SlashCommandBuilder()
    .setName("role-panel")
    .setDescription("Post a panel for members to self-assign cosmetic roles.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel where the role panel will be posted.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Panel title.")
        .setMaxLength(256),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Instructions shown above the role list.")
        .setMaxLength(1000),
    )
    .addStringOption((option) =>
      option
        .setName("selection_mode")
        .setDescription("Whether members can choose multiple roles or only one.")
        .addChoices(
          { name: "Multiple roles", value: "multiple" },
          { name: "One role at a time", value: "exclusive" },
        ),
    )
    .addRoleOption((option) =>
      option.setName("role_1").setDescription("First cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_1").setDescription("Unicode emoji for role 1."),
    )
    .addRoleOption((option) =>
      option.setName("role_2").setDescription("Second cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_2").setDescription("Unicode emoji for role 2."),
    )
    .addRoleOption((option) =>
      option.setName("role_3").setDescription("Third cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_3").setDescription("Unicode emoji for role 3."),
    )
    .addRoleOption((option) =>
      option.setName("role_4").setDescription("Fourth cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_4").setDescription("Unicode emoji for role 4."),
    )
    .addRoleOption((option) =>
      option.setName("role_5").setDescription("Fifth cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_5").setDescription("Unicode emoji for role 5."),
    )
    .addRoleOption((option) =>
      option.setName("role_6").setDescription("Sixth cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_6").setDescription("Unicode emoji for role 6."),
    )
    .addRoleOption((option) =>
      option.setName("role_7").setDescription("Seventh cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_7").setDescription("Unicode emoji for role 7."),
    )
    .addRoleOption((option) =>
      option.setName("role_8").setDescription("Eighth cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_8").setDescription("Unicode emoji for role 8."),
    )
    .addRoleOption((option) =>
      option.setName("role_9").setDescription("Ninth cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_9").setDescription("Unicode emoji for role 9."),
    )
    .addRoleOption((option) =>
      option.setName("role_10").setDescription("Tenth cosmetic role."),
    )
    .addStringOption((option) =>
      option.setName("emoji_10").setDescription("Unicode emoji for role 10."),
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
        content: "You need Manage Server permission to create a role panel.",
        ephemeral: true,
      })
    }

    const channel = interaction.options.getChannel("channel")
    const botMember =
      interaction.guild.members.me ||
      (await interaction.guild.members.fetchMe())
    if (!hasReactionPanelPermissions(channel, botMember)) {
      return interaction.reply({
        content:
          "The bot needs View Channel, Send Messages, Embed Links, Add Reactions, and Read Message History in the panel channel.",
        ephemeral: true,
      })
    }

    const mappings = []
    const roles = new Set()
    const emojis = new Set()

    for (const option of panelOptions) {
      const role = interaction.options.getRole(option.role)
      const emoji = interaction.options.getString(option.emoji)?.trim()

      if (!role && !emoji) continue
      if (!role || !emoji) {
        return interaction.reply({
          content: `Provide both ${option.role} and ${option.emoji}.`,
          ephemeral: true,
        })
      }

      if (!isSingleUnicodeEmoji(emoji)) {
        return interaction.reply({
          content: `${option.emoji} must be a single Unicode emoji.`,
          ephemeral: true,
        })
      }

      if (!isCosmeticRole(role, interaction.guild)) {
        return interaction.reply({
          content: `${role} must have no Discord permissions, must not be managed, and must be below roles with permissions.`,
          ephemeral: true,
        })
      }

      if (roles.has(role.id)) {
        return interaction.reply({
          content: "Each role can only appear once in a panel.",
          ephemeral: true,
        })
      }
      if (emojis.has(emoji)) {
        return interaction.reply({
          content: "Each role must use a different emoji.",
          ephemeral: true,
        })
      }

      roles.add(role.id)
      emojis.add(emoji)
      mappings.push({ role, emoji })
    }

    if (mappings.length === 0) {
      return interaction.reply({
        content: "Choose at least one role and its matching emoji.",
        ephemeral: true,
      })
    }

    const title = interaction.options.getString("title") || "Choose your roles"
    const description =
      interaction.options.getString("description") ||
      "React below to add or remove a cosmetic role."
    const selectionMode =
      interaction.options.getString("selection_mode") || "multiple"
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(title)
      .setDescription(
        [
          description,
          "",
          ...mappings.map(({ role, emoji }) => `${emoji} — <@&${role.id}>`),
          "",
          selectionMode === "exclusive"
            ? "Choosing a role removes your other role selections from this panel."
            : "You can choose more than one role.",
        ].join("\n"),
      )
      .setFooter({ text: "React to add a role; remove your reaction to remove it." })

    await interaction.deferReply({ ephemeral: true })

    let panelMessage
    let configSaved = false
    try {
      panelMessage = await channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      })

      await setRolePanelConfig(interaction.guildId, panelMessage.id, {
        channelId: channel.id,
        selectionMode,
        roles: Object.fromEntries(
          mappings.map(({ role, emoji }) => [emoji, role.id]),
        ),
      })
      configSaved = true

      for (const { emoji } of mappings) {
        await panelMessage.react(emoji)
      }
    } catch (error) {
      console.error(
        `Failed to create reaction role panel in guild ${interaction.guildId}:`,
        error,
      )

      if (configSaved) {
        await removeRolePanelConfig(interaction.guildId, panelMessage.id)
      }
      if (panelMessage) {
        await panelMessage.delete().catch((deleteError) => {
          console.error("Could not remove incomplete reaction role panel:", deleteError)
        })
      }

      return interaction.editReply(
        "The role panel could not be completed. Check the bot's channel permissions and try again.",
      )
    }

    return interaction.editReply(
      `The role panel is ready in ${channel}: ${panelMessage.url}`,
    )
  },
}
