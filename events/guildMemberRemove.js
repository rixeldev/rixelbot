import { Events } from "discord.js"

import { sendMemberMessage } from "../systems/memberMessages.js"

export default function registerGuildMemberRemove(client) {
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await sendMemberMessage(member, "leave")
    } catch (error) {
      console.error(
        `Leave message failed in guild ${member.guild.id} for member ${member.id}:`,
        error,
      )
    }
  })
}
