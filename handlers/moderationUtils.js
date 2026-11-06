import { PermissionFlagsBits } from "discord.js"

export async function checkModeration({
  guild,
  moderatorId,
  targetId,
  permission,
}) {
  const moderator = await guild.members.fetch(moderatorId)
  const target = await guild.members.fetch(targetId).catch(() => null)
  const bot = guild.members.me

  if (!moderator.permissions.has(permission)) {
    return {
      error: "❌ You do not have permission to perform this action.",
    }
  }

  if (!bot.permissions.has(permission)) {
    return {
      error: "❌ I do not have the required permissions.",
    }
  }

  if (!target) {
    return {
      error: "❌ Member not found.",
    }
  }

  if (target.id === moderator.id) {
    return {
      error: "❌ You cannot moderate yourself.",
    }
  }

  if (target.id === guild.ownerId) {
    return {
      error: "❌ You cannot moderate the server owner.",
    }
  }

  if (
    moderator.id !== guild.ownerId &&
    target.roles.highest.comparePositionTo(moderator.roles.highest) >= 0
  ) {
    return {
      error: "❌ You cannot moderate a member with an equal or higher role.",
    }
  }

  if (target.roles.highest.comparePositionTo(bot.roles.highest) >= 0) {
    return {
      error: "❌ My role is not high enough to moderate this member.",
    }
  }

  return {
    moderator,
    target,
    bot,
  }
}

export const MODERATION_PERMISSIONS = PermissionFlagsBits
