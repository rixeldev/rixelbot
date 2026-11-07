import { PermissionFlagsBits } from "discord.js"

import { getGuildConfig } from "../handlers/guildConfigStore.js"

const reactionQueues = new Map()

function assertSelfAssignable(role) {
  if (role.permissions.bitfield !== 0n) {
    throw new Error(
      `Reaction role ${role.id} now has permissions; refusing self-assignment`,
    )
  }
  if (!role.editable) {
    throw new Error(`Reaction role ${role.id} is no longer manageable by the bot`)
  }
}

async function fetchReactionParts(reaction, user) {
  if (reaction.partial) await reaction.fetch()
  if (reaction.message.partial) await reaction.message.fetch()

  return { message: reaction.message, user }
}

async function updateRoleForReaction(message, reaction, user, shouldAdd) {
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
    if (panel.selectionMode === "exclusive") {
      const panelRoles = await Promise.all(
        Object.entries(panel.roles).map(async ([panelEmoji, panelRoleId]) => {
          const panelRole = await guild.roles.fetch(panelRoleId)
          if (!panelRole) {
            throw new Error(
              `Configured reaction role ${panelRoleId} no longer exists`,
            )
          }
          assertSelfAssignable(panelRole)
          return { emoji: panelEmoji, role: panelRole }
        }),
      )

      await member.roles.add(role, "Member opted into a cosmetic reaction role")

      const otherRoles = panelRoles
        .map(({ role: panelRole }) => panelRole)
        .filter((panelRole) => panelRole.id !== role.id)
      const rolesToRemove = otherRoles.filter((panelRole) =>
        member.roles.cache.has(panelRole.id),
      )

      if (rolesToRemove.length > 0) {
        await member.roles.remove(
          rolesToRemove,
          "Member selected a different exclusive cosmetic role",
        )

        for (const { emoji: otherEmoji, role: otherRole } of panelRoles) {
          if (!rolesToRemove.some(({ id }) => id === otherRole.id)) continue
          const otherReaction = message.reactions.cache.find(
            (cachedReaction) => cachedReaction.emoji.name === otherEmoji,
          )
          if (otherReaction) {
            await otherReaction.users.remove(user.id)
          }
        }
      }
    } else {
      assertSelfAssignable(role)
      await member.roles.add(role, "Member opted into a cosmetic reaction role")
    }
  } else {
    await member.roles.remove(role, "Member opted out of a cosmetic reaction role")
  }

  return true
}

export async function handleRoleReaction(reaction, user, shouldAdd) {
  if (user.bot) return false

  const { message } = await fetchReactionParts(reaction, user)
  if (!message.guild) return false

  const queueKey = `${message.guild.id}:${message.id}:${user.id}`
  const previous = reactionQueues.get(queueKey) || Promise.resolve()
  const operation = previous
    .catch(() => {})
    .then(() => updateRoleForReaction(message, reaction, user, shouldAdd))

  reactionQueues.set(queueKey, operation)
  try {
    return await operation
  } finally {
    if (reactionQueues.get(queueKey) === operation) {
      reactionQueues.delete(queueKey)
    }
  }
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
