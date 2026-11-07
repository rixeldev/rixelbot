import { getGuildConfig } from "../handlers/guildConfigStore.js"

const memberMessageEvents = {
  welcome: "welcome",
  leave: "leave",
}

export async function sendMemberMessage(member, event) {
  if (member.user.bot) return false

  const messageType = memberMessageEvents[event]
  if (!messageType) {
    throw new Error(`Unsupported member message event: ${event}`)
  }

  const { memberMessages } = await getGuildConfig(member.guild.id)
  const config = memberMessages?.[messageType]
  if (!config) return false

  const channel = await member.guild.channels.fetch(config.channelId)
  if (!channel?.isTextBased()) {
    throw new Error(
      `Configured ${messageType} channel ${config.channelId} is unavailable or not text-based`,
    )
  }

  const content = config.content
    .replaceAll("{member}", member.displayName)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount))

  await channel.send({
    content,
    allowedMentions: { parse: [] },
  })

  return true
}
