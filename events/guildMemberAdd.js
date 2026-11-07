import { Events } from "discord.js"
import { handleMemberJoinGuard } from "../systems/autoModeration.js"
import { handleMemberAutoRole } from "../systems/autoRole.js"

export default function registerGuildMemberAdd(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await handleMemberJoinGuard(member)
    } catch (error) {
      console.error(
        `Auto moderation join handler failed in guild ${member.guild.id}:`,
        error,
      )
    }

    try {
      await handleMemberAutoRole(member)
    } catch (error) {
      console.error(
        `Automatic role assignment failed in guild ${member.guild.id} for member ${member.id}:`,
        error,
      )
    }
  })
}
