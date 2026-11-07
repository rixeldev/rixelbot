import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

import {
  getGuildConfig,
  removeRolePanelConfig,
} from "../handlers/guildConfigStore.js"

export default {
  data: new SlashCommandBuilder()
    .setName("role-panel-remove")
    .setDescription("Disable a reaction role panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("ID of the role panel message to disable.")
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20),
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
        content: "You need Manage Server permission to disable role panels.",
        ephemeral: true,
      })
    }

    const messageId = interaction.options.getString("message_id").trim()
    const panels = (await getGuildConfig(interaction.guildId)).rolePanels || {}
    if (!panels[messageId]) {
      return interaction.reply({
        content: "No active role panel with that message ID was found.",
        ephemeral: true,
      })
    }

    await removeRolePanelConfig(interaction.guildId, messageId)
    return interaction.reply({
      content:
        "That panel is disabled. Delete its message from the channel if you no longer want it displayed.",
      ephemeral: true,
    })
  },
}
