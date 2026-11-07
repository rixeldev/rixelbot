import { PermissionFlagsBits } from "discord.js"

import { getGuildConfig } from "../handlers/guildConfigStore.js"

async function fetchReactionParts(reaction, user) {
  if (reaction.partial) await reaction.fetch()
  if (reaction.message.partial) await reaction.message.fetch()

  return { message: reaction.message, user }
}

export async function handleRoleReaction(reaction, user, shouldAdd) {
  if (user.bot) return false

  const { message } = await fetchReactionParts(reaction, user)
  const guild = message.guild
  if (!guild) return false

  const config = await getGuildConfig(guild.id)
  const panel = config.rolePanels?.[message.id]
  if (!panel || panel.channelId !== message.channelId) return false

  const emoji = reaction.emoji.name
  const roleId = emoji ? panel.roles?.[emoji] : null
  if (!roleId) return false

  const member = await guild.members.fetch(user.id)
  if (member.user.bot) return false

  const role = await guild.roles.fetch(roleId)
  if (!role) {
    throw new Error(`Configured reaction role ${roleId} no longer exists`)
  }

  if (shouldAdd) {
    if (role.permissions.bitfield !== 0n) {
      throw new Error(
        `Reaction role ${roleId} now has permissions; refusing self-assignment`,
      )
    }
    if (!role.editable) {
      throw new Error(`Reaction role ${roleId} is not manageable by the bot`)
    }

    await member.roles.add(role, "Member opted into a cosmetic reaction role")
  } else {
    await member.roles.remove(role, "Member opted out of a cosmetic reaction role")
  }

  return true
}

export function isCosmeticRole(role, guild) {
  if (
    role.id === guild.roles.everyone.id ||
    role.managed ||
    role.permissions.bitfield !== 0n ||
    !role.editable
  ) {
    return false
  }

  const functionalRolePositions = guild.roles.cache
    .filter(
      (candidate) =>
        candidate.id !== guild.roles.everyone.id &&
        candidate.permissions.bitfield !== 0n,
    )
    .map((candidate) => candidate.position)

  return functionalRolePositions.every((position) => role.position < position)
}

export function hasReactionPanelPermissions(channel, botMember) {
  return channel
    .permissionsFor(botMember)
    ?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ReadMessageHistory,
    ]) ?? false
}
