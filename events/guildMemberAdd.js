import { Events } from "discord.js"
import { handleMemberJoinGuard } from "../systems/autoModeration.js"

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
  })
}
