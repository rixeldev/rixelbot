import { PermissionFlagsBits } from "discord.js"

import { getGuildConfig } from "../handlers/guildConfigStore.js"

export async function handleMemberAutoRole(member) {
  if (member.user.bot) return false

  const { autoRoleConfig } = await getGuildConfig(member.guild.id)
  const roleId = autoRoleConfig?.roleId
  if (!roleId) return false

  const role = await member.guild.roles.fetch(roleId)
  if (!role) {
    throw new Error(`Configured auto-role ${roleId} no longer exists`)
  }

  if (member.roles.cache.has(role.id)) return false

  const botMember =
    member.guild.members.me || (await member.guild.members.fetchMe())
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("The bot is missing the Manage Roles permission")
  }
  if (!role.editable) {
    throw new Error(`Configured auto-role ${roleId} is not manageable by the bot`)
  }

  await member.roles.add(role, "Configured automatic member role")
  return true
}
