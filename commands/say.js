import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js"

export default {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Makes the bot say the message you write.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("mensaje")
        .setDescription("The message you want the bot to repeat")
        .setRequired(true),
    ),

  async execute(interaction) {
    const texto = interaction.options.getString("mensaje")

    await interaction.channel.send({ content: texto })
    await interaction.reply({
      content: "✅ Message sent.",
      ephemeral: true,
    })
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return await message.reply({
        content: "❌ You do not have permission to use this command.",
      })
    }

    const texto = args.join(" ")

    if (!texto) {
      return await message.reply({
        content: "❌ You must write the message you want the bot to say.",
      })
    }

    await message.channel.send({ content: texto })

    await message
      .delete()
      .catch((error) =>
        console.error("Failed to delete the original message:", error),
      )
  },
}
