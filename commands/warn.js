import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js"
import { logModerationAction } from "../handlers/moderationLogs.js"
import { checkModeration } from "../handlers/moderationUtils.js"
import { addWarning } from "../handlers/warningsStore.js"

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issues a warning to a member. (Administration only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The member to warn.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the warning.")
        .setMaxLength(500)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply()

    const user = interaction.options.getUser("user")
    const reason = interaction.options.getString("reason")

    const result = await checkModeration({
      guild: interaction.guild,
      moderatorId: interaction.user.id,
      targetId: user.id,
      permission: PermissionFlagsBits.ModerateMembers,
    })

    if (result.error) {
      return interaction.editReply(result.error)
    }

    const warning = await addWarning(interaction.guild.id, user.id, {
      moderatorId: interaction.user.id,
      reason,
    })

    await logModerationAction(interaction.client, {
      guild: interaction.guild,
      action: "WARN",
      target: result.target.user,
      moderator: interaction.user,
      reason,
      warningId: warning.id,
    })

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("⚠️ Member Warned")
      .addFields(
        { name: "Member", value: user.tag, inline: true },
        { name: "Warning ID", value: warning.id, inline: true },
        { name: "Moderator", value: interaction.user.tag },
        { name: "Reason", value: reason },
      )
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })

    await user
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("⚠️ You have received a warning")
            .setDescription(
              `You received a warning in **${interaction.guild.name}**.`,
            )
            .addFields(
              { name: "Reason", value: reason },
              { name: "Warning ID", value: warning.id },
            )
            .setTimestamp(),
        ],
      })
      .catch(() => null)
  },

  async executePrefix(message, args) {
    const targetId = args[0]?.match(/^<@!?(\d+)>$/)?.[1] || args[0]

    if (!targetId || !args.slice(1).length) {
      return message.reply("Usage: `r!warn @user [reason]`")
    }

    const reason = args.slice(1).join(" ")

    const result = await checkModeration({
      guild: message.guild,
      moderatorId: message.author.id,
      targetId,
      permission: PermissionFlagsBits.ModerateMembers,
    })

    if (result.error) {
      return message.reply(result.error)
    }

    const warning = await addWarning(message.guild.id, targetId, {
      moderatorId: message.author.id,
      reason,
    })

    await logModerationAction(message.client, {
      guild: message.guild,
      action: "WARN",
      target: result.target.user,
      moderator: message.author,
      reason,
      warningId: warning.id,
    })

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("⚠️ Member Warned")
      .addFields(
        { name: "Member", value: result.target.user.tag, inline: true },
        { name: "Warning ID", value: warning.id, inline: true },
        { name: "Moderator", value: message.author.tag },
        { name: "Reason", value: reason },
      )
      .setTimestamp()

    await message.reply({ embeds: [embed] })

    await result.target
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("⚠️ You have received a warning")
            .setDescription(
              `You received a warning in **${interaction.guild.name}**.`,
            )
            .addFields(
              { name: "Reason", value: reason },
              { name: "Warning ID", value: warning.id },
            )
            .setTimestamp(),
        ],
      })
      .catch(() => null)
  },
}
