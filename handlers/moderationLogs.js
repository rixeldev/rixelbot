import { EmbedBuilder } from "discord.js"
import { getGuildConfig } from "./guildConfigStore.js"

export async function logModerationAction(
  client,
  {
    guild,
    action,
    target,
    moderator,
    reason,
    duration,
    warningId,
    warningReason,
  },
) {
  try {
    const config = await getGuildConfig(guild.id)

    if (!config.logChannelId) return

    const channel = await guild.channels
      .fetch(config.logChannelId)
      .catch(() => null)

    if (!channel || !channel.isTextBased() || !channel.messages) {
      console.warn(`RixelBot: Invalid moderation log channel in ${guild.name}`)
      return
    }

    const actionSettings = {
      BAN: {
        title: "🔨 Member Banned",
        color: 0xed4245,
      },
      KICK: {
        title: "👢 Member Kicked",
        color: 0xed4245,
      },
      TIMEOUT: {
        title: "🔇 Member Timed Out",
        color: 0xfee75c,
      },
      WARN: {
        title: "⚠️ Member Warned",
        color: 0xfee75c,
      },
      UNWARN: {
        title: "↩️ Warning Revoked",
        color: 0x5865f2,
      },
    }

    const settings = actionSettings[action]

    if (!settings) return

    const embed = new EmbedBuilder()
      .setColor(settings.color)
      .setTitle(settings.title)
      .addFields(
        {
          name: "Target",
          value: `${target.tag} (\`${target.id}\`)`,
        },
        {
          name: "Moderator",
          value: `${moderator.tag} (\`${moderator.id}\`)`,
        },
        {
          name: "Reason",
          value: reason || "No reason provided.",
        },
      )
      .setTimestamp()

    if (duration) {
      embed.addFields({
        name: "Duration",
        value: duration,
        inline: true,
      })
    }

    if (warningId) {
      embed.addFields({
        name: "Warning ID",
        value: warningId,
        inline: true,
      })
    }

    if (warningReason) {
      embed.addFields({
        name: "Original Warning",
        value: warningReason,
      })
    }

    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    console.error("Moderation logging error:", error)
  }
}
