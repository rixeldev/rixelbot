import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Deletes a specific number of messages from the channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount")

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true)

      await interaction.reply({
        content: `✅ Successfully deleted **${deleted.size}** messages.`,
        ephemeral: true,
      })
    } catch (error) {
      console.error(error)
      await interaction.reply({
        content:
          "❌ There was an error trying to purge messages in this channel. (Note: Messages older than 14 days cannot be bulk deleted)",
        ephemeral: true,
      })
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await message.reply({
        content: "❌ You do not have permission to use this command.",
      })
    }

    const amount = parseInt(args[0])

    if (isNaN(amount) || amount < 1 || amount > 100) {
      return await message.reply({
        content: "❌ Please provide a valid number between 1 and 100.",
      })
    }

    try {
      await message.delete().catch(() => {})

      const deleted = await message.channel.bulkDelete(amount, true)

      const notice = await message.channel.send({
        content: `✅ Successfully deleted **${deleted.size}** messages.`,
      })
      setTimeout(() => notice.delete().catch(() => {}), 5000)
    } catch (error) {
      console.error(error)
      await message.channel.send({
        content:
          "❌ There was an error trying to purge messages in this channel. (Note: Messages older than 14 days cannot be bulk deleted)",
      })
    }
  },
}
