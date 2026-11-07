import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js"

import { createGuildBackup } from "../systems/backup.js"

export default {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Download a private JSON backup of this server's bot data.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "You need Manage Server permission to download a backup.",
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const { buffer, fileName } = await createGuildBackup(interaction.guild)
      const attachment = new AttachmentBuilder(buffer, { name: fileName })

      return interaction.editReply({
        content:
          "Your server backup is attached. It includes private ticket records and moderation history; store the file securely.",
        files: [attachment],
      })
    } catch (error) {
      console.error(`Backup creation failed for guild ${interaction.guildId}:`, error)
      return interaction.editReply(
        "The backup could not be created. Check the bot logs or reduce stored data before trying again.",
      )
    }
  },
}
