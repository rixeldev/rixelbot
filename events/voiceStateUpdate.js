import { Events, ChannelType } from "discord.js"

import {
  getGeneratorChannel,
  isTemporaryChannel,
  createTemporaryChannel,
  deleteTemporaryChannel,
} from "../systems/temporaryVoice.js"

export default function registerVoiceStateUpdate(client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const member = newState.member

      if (!member || member.user.bot) return

      const guild = newState.guild

      // Detect entry into the generator channel.
      const generatorChannelId = getGeneratorChannel(guild.id)

      if (
        newState.channelId === generatorChannelId &&
        oldState.channelId !== generatorChannelId
      ) {
        await createTemporaryChannel(member)
      }

      // Detect when a temporary room becomes empty.
      if (
        oldState.channelId &&
        oldState.channelId !== newState.channelId &&
        isTemporaryChannel(guild.id, oldState.channelId)
      ) {
        const oldChannel = oldState.channel

        if (oldChannel && oldChannel.members.size === 0) {
          await deleteTemporaryChannel(oldState.channelId, guild)
        }
      }
    } catch (error) {
      console.error("[TemporaryVoice] Voice state error:", error)
    }
  })
}
