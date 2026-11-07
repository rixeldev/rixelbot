import { PermissionFlagsBits } from "discord.js"

import { getGuildConfig } from "../handlers/guildConfigStore.js"

const defaultSpamWindowMs = 8_000
const defaultSpamMessageLimit = 6
const duplicateMessageLimit = 3
const spamStrikeWindowMs = 10 * 60 * 1000
const raidAlertCooldownMs = 60_000
const spamAlertCooldownMs = 20_000
const maxTrackedEntries = 10_000
const invitePattern =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[a-z0-9-]+/gi

const messageWindows = new Map()
const spamStrikes = new Map()
const alertCooldowns = new Map()
const joinWindows = new Map()

function pruneMap(map, now, maxAge) {
  for (const [key, value] of map) {
    const lastValue = Array.isArray(value) ? value.at(-1) : value
    const timestamp =
      typeof lastValue === "object" && lastValue !== null
        ? lastValue.timestamp
        : lastValue
    if (timestamp === undefined || now - timestamp > maxAge) map.delete(key)
  }

  while (map.size > maxTrackedEntries) {
    map.delete(map.keys().next().value)
  }
}

function normalizeMessageContent(content) {
  return content.trim().replace(/\s+/g, " ").toLowerCase()
}

export function detectSpam({
  messages,
  content,
  now,
  windowMs = defaultSpamWindowMs,
  messageLimit = defaultSpamMessageLimit,
  mentionCount = 0,
  mentionLimit = 5,
}) {
  const recentMessages = messages.filter(
    (message) => now - message.timestamp <= windowMs,
  )

  const normalizedContent = normalizeMessageContent(content)
  const duplicateCount = normalizedContent
    ? recentMessages.filter(
        (message) => message.normalizedContent === normalizedContent,
      ).length + 1
    : 0

  return {
    isSpam:
      recentMessages.length + 1 >= messageLimit ||
      duplicateCount >= duplicateMessageLimit ||
      mentionCount >= mentionLimit,
    count: recentMessages.length + 1,
    duplicateCount,
    mentionCount,
    recentMessages,
  }
}

function canManageMessages(message) {
  return (
    message.member.id === message.guild.ownerId ||
    message.member
      .permissionsIn(message.channel)
      .has(PermissionFlagsBits.ManageMessages)
  )
}

function isExempt(message, guardConfig) {
  return (
    canManageMessages(message) ||
    (guardConfig.bypassRoleId &&
      message.member.roles.cache.has(guardConfig.bypassRoleId))
  )
}

function alertKey(guildId, type, subjectId = "") {
  return `${guildId}:${type}:${subjectId}`
}

async function sendGuardAlert(guild, guardConfig, type, content, subjectId) {
  const now = Date.now()
  pruneMap(alertCooldowns, now, raidAlertCooldownMs)

  const key = alertKey(guild.id, type, subjectId)
  const lastAlert = alertCooldowns.get(key)
  if (lastAlert && now - lastAlert < spamAlertCooldownMs) return false

  alertCooldowns.set(key, now)

  const channel = await guild.channels
    .fetch(guardConfig.alertChannelId)
    .catch((error) => {
      if (error.code === 10003) return null
      throw error
    })

  if (!channel?.isTextBased() || !channel.send) {
    console.error(
      `Auto moderation alert channel is unavailable in guild ${guild.id}`,
    )
    return false
  }

  try {
    await channel.send({
      content,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    console.error(`Could not send auto moderation alert in guild ${guild.id}:`, error)
    return false
  }

  return true
}

function isDiscordInvite(content) {
  invitePattern.lastIndex = 0
  return invitePattern.test(content)
}

function recordSpamStrike(guildId, userId, now) {
  pruneMap(spamStrikes, now, spamStrikeWindowMs)
  const key = `${guildId}:${userId}`
  const previous = spamStrikes.get(key)
  const count =
    previous && now - previous.timestamp <= spamStrikeWindowMs
      ? previous.count + 1
      : 1

  spamStrikes.set(key, { timestamp: now, count })
  return count
}

async function deleteSpamMessage(message, guardConfig) {
  const botPermissions = message.guild.members.me
    ? message.channel.permissionsFor(message.guild.members.me)
    : null
  if (!botPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    console.error(
      `Auto moderation cannot delete spam in guild ${message.guild.id}: bot is missing Manage Messages`,
    )
    return false
  }

  try {
    await message.delete()
    return true
  } catch (error) {
    console.error(
      `Could not delete spam message ${message.id} in guild ${message.guild.id}:`,
      error,
    )
    await sendGuardAlert(
      message.guild,
      guardConfig,
      "delete-failed",
      `Auto moderation detected spam by <@${message.author.id}> but could not delete the message. Check the bot's channel permissions.`,
      message.author.id,
    )
    return false
  }
}

async function applyRepeatTimeout(message, guardConfig, strikeCount) {
  const member = message.member
  const botMember = message.guild.members.me

  if (
    !member ||
    member.id === message.guild.ownerId ||
    !member.moderatable ||
    !botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)
  ) {
    await sendGuardAlert(
      message.guild,
      guardConfig,
      "spam",
      `Repeated spam detected from <@${message.author.id}> (${strikeCount} detections), but the configured timeout could not be applied.`,
      message.author.id,
    )
    return false
  }

  try {
    await member.timeout(
      5 * 60 * 1000,
      "Repeated spam detected by RixelBot auto moderation",
    )
    await sendGuardAlert(
      message.guild,
      guardConfig,
      "spam-timeout",
      `<@${message.author.id}> received a 5-minute timeout after repeated spam detections.`,
      message.author.id,
    )
    return true
  } catch (error) {
    console.error(
      `Could not timeout spammer ${message.author.id} in guild ${message.guild.id}:`,
      error,
    )
    await sendGuardAlert(
      message.guild,
      guardConfig,
      "spam",
      `Repeated spam detected from <@${message.author.id}> (${strikeCount} detections), but the configured timeout failed.`,
      message.author.id,
    )
    return false
  }
}

async function handleInvite(message, guardConfig) {
  if (
    !guardConfig.inviteFilterEnabled ||
    !isDiscordInvite(message.content) ||
    isExempt(message, guardConfig) ||
    message.channelId === guardConfig.ignoredChannelId
  ) {
    return false
  }

  const deleted = await deleteSpamMessage(message, guardConfig)
  await sendGuardAlert(
    message.guild,
    guardConfig,
    "invite",
    deleted
      ? `Removed a Discord invite posted by <@${message.author.id}> in <#${message.channelId}>.`
      : `A Discord invite from <@${message.author.id}> in <#${message.channelId}> needs moderator review; deletion failed.`,
    message.author.id,
  )
  return true
}

async function handleSpam(message, guardConfig) {
  if (
    !guardConfig.spamProtectionEnabled ||
    isExempt(message, guardConfig) ||
    message.channelId === guardConfig.ignoredChannelId
  ) {
    return false
  }

  const now = Date.now()
  const key = `${message.guild.id}:${message.channelId}:${message.author.id}`
  const priorMessages = messageWindows.get(key) || []
  const result = detectSpam({
    messages: priorMessages,
    content: message.content,
    now,
    windowMs: guardConfig.spamWindowSeconds * 1000,
    messageLimit: guardConfig.spamMessageLimit,
    mentionCount:
      message.mentions.users.size +
      message.mentions.roles.size +
      (message.mentions.everyone ? 5 : 0),
    mentionLimit: guardConfig.mentionLimit,
  })

  if (!result.isSpam) {
    messageWindows.set(
      key,
      [
        ...result.recentMessages,
        {
          timestamp: now,
          normalizedContent: normalizeMessageContent(message.content),
        },
      ],
    )
    pruneMap(messageWindows, now, guardConfig.spamWindowSeconds * 1000)
    return false
  }

  const strikeCount = recordSpamStrike(message.guild.id, message.author.id, now)
  if (guardConfig.spamAction !== "alert_only") {
    await deleteSpamMessage(message, guardConfig)
  }

  if (guardConfig.spamAction === "delete_timeout" && strikeCount >= 2) {
    await applyRepeatTimeout(message, guardConfig, strikeCount)
  } else {
    await sendGuardAlert(
      message.guild,
      guardConfig,
      "spam",
      `Possible spam detected from <@${message.author.id}> in <#${message.channelId}> (${result.count} messages/${guardConfig.spamWindowSeconds}s, ${result.duplicateCount} duplicates, ${result.mentionCount} mentions).`,
      message.author.id,
    )
  }

  messageWindows.delete(key)
  return guardConfig.spamAction !== "alert_only"
}

export async function handleGuildMessageGuard(message) {
  if (
    !message.guild ||
    message.author.bot ||
    message.webhookId ||
    !message.member
  ) {
    return false
  }

  const guildConfig = await getGuildConfig(message.guild.id)
  const guardConfig = guildConfig.guardConfig
  if (!guardConfig?.enabled) return false

  if (await handleInvite(message, guardConfig)) return true
  return handleSpam(message, guardConfig)
}

export async function handleMemberJoinGuard(member) {
  const guildConfig = await getGuildConfig(member.guild.id)
  const guardConfig = guildConfig.guardConfig
  if (!guardConfig?.raidDetectionEnabled) return false

  const now = Date.now()
  const windowMs = guardConfig.raidWindowSeconds * 1000
  const key = member.guild.id
  const recentJoins = (joinWindows.get(key) || []).filter(
    (timestamp) => now - timestamp <= windowMs,
  )
  recentJoins.push(now)
  joinWindows.set(key, recentJoins)
  pruneMap(joinWindows, now, windowMs)

  if (recentJoins.length < guardConfig.raidJoinLimit) return false

  const sent = await sendGuardAlert(
    member.guild,
    guardConfig,
    "raid",
    `Possible raid detected: ${recentJoins.length} members joined within ${guardConfig.raidWindowSeconds} seconds. No members were automatically restricted.`,
    "",
  )
  return sent
}
