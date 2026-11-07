import { Events } from "discord.js"

import { handleRoleReaction } from "../systems/reactionRoles.js"

export default function registerReactionRoleEvents(client) {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      await handleRoleReaction(reaction, user, true)
    } catch (error) {
      console.error("Could not assign a reaction role:", error)
    }
  })

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      await handleRoleReaction(reaction, user, false)
    } catch (error) {
      console.error("Could not remove a reaction role:", error)
    }
  })
}
