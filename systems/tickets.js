import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js"

import {
  getConfiguredTicketGuilds,
  getGuildConfig,
} from "../handlers/guildConfigStore.js"
import {
  createTicketRecord,
  deleteTicketRecord,
  getOpenTicketByUser,
  getTicketByChannel,
  updateTicket,
} from "../handlers/ticketStore.js"

const pendingDMs = new Map()
const pendingDMTimeout = 10 * 60 * 1000
const maxPendingMessages = 5
const maxTranscriptMessages = 1000
const maxTranscriptBytes = 7 * 1024 * 1024

function ticketNumber(ticket) {
  return ticket.channelId.slice(-6)
}

function safeChannelName(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "member"
  )
}

function createPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:open")
        .setLabel("Open a ticket")
        .setStyle(ButtonStyle.Primary),
    ),
  ]
}

function createTicketComponents(ticket) {
  const isOpen = ticket.status === "open"

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:claim:${ticket.channelId}`)
        .setLabel(ticket.claimedBy ? "Claimed" : "Claim")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isOpen || Boolean(ticket.claimedBy)),
      new ButtonBuilder()
        .setCustomId(
          `ticket:${isOpen ? "close" : "reopen"}:${ticket.channelId}`,
        )
        .setLabel(isOpen ? "Close ticket" : "Reopen ticket")
        .setStyle(isOpen ? ButtonStyle.Danger : ButtonStyle.Success),
    ),
  ]
}

function createTicketEmbed(ticket) {
  const embed = new EmbedBuilder()
    .setColor(ticket.status === "open" ? 0x5865f2 : 0x747f8d)
    .setTitle(`Ticket #${ticketNumber(ticket)} - ${ticket.subject}`)
    .setDescription(
      [
        `**Opened by:** <@${ticket.ownerId}>`,
        `**Status:** ${ticket.status}`,
        `**Claimed by:** ${
          ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Not claimed"
        }`,
        "",
        ticket.details || "No additional details provided.",
        "",
        ticket.source === "dm"
          ? "The user is communicating with support through direct messages."
          : "The user can reply directly in this channel.",
      ].join("\n"),
    )
    .setFooter({ text: "RixelBot Ticket System" })
    .setTimestamp(new Date(ticket.createdAt))

  return embed
}

function createPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support")
    .setDescription(
      "Open a private support ticket with the button below. You can also send the bot a direct message.",
    )
    .setFooter({ text: "RixelBot Ticket System" })
}

function getMemberRoleIds(member) {
  if (member?.roles?.cache) return [...member.roles.cache.keys()]
  if (Array.isArray(member?.roles)) return member.roles
  return []
}

function isSupportStaff(interaction, ticket) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    getMemberRoleIds(interaction.member).includes(ticket.supportRoleId)
  )
}

function createOpenTicketModal() {
  const subject = new TextInputBuilder()
    .setCustomId("subject")
    .setLabel("What do you need help with?")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true)

  const details = new TextInputBuilder()
    .setCustomId("details")
    .setLabel("Describe the issue")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true)

  return new ModalBuilder()
    .setCustomId("ticket:open-modal")
    .setTitle("Open a support ticket")
    .addComponents(
      new ActionRowBuilder().addComponents(subject),
      new ActionRowBuilder().addComponents(details),
    )
}

function serializeMessage(message) {
  return {
    content: message.content,
    attachments: [...message.attachments.values()].map(({ name, url }) => ({
      name,
      url,
    })),
    timestamp: message.createdAt.toISOString(),
  }
}

function getTicketLocation(client, ticket) {
  const guildName = client.guilds.cache.get(ticket.guildId)?.name
  const channelMention = `<#${ticket.channelId}>`
  return guildName ? `**${guildName}**, ${channelMention}` : channelMention
}

function assertPrivateSupportChannel(channel, guild, supportRoleId) {
  const supportRole = guild.roles.cache.get(supportRoleId)

  if (
    channel
      .permissionsFor(guild.roles.everyone)
      ?.has(PermissionFlagsBits.ViewChannel) ||
    !supportRole ||
    !channel.permissionsFor(supportRole)?.has(PermissionFlagsBits.ViewChannel)
  ) {
    throw new Error(
      "The staff channel must be private and visible to the support role",
    )
  }
}

function appendPendingMessage(pending, message) {
  if (pending.messages.length >= maxPendingMessages) return false
  pending.messages.push(serializeMessage(message))
  return true
}

async function remindPendingDM(message, pending) {
  const added = appendPendingMessage(pending, message)
  await sendDMTicketPrompt(
    message,
    added
      ? "I added this to your request. Choose a server using the selection menu I sent earlier."
      : "Your request is waiting for server selection. Further messages will not be added until you choose a server.",
  )
}

function createForwardEmbed(user, message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `${user.tag} (${user.id})`,
      iconURL: user.displayAvatarURL(),
    })
    .setDescription(message.content.slice(0, 4000) || "Attachment")
    .setTimestamp(message.timestamp ? new Date(message.timestamp) : new Date())

  if (message.attachments.length > 0) {
    embed.addFields({
      name: "Attachments",
      value: message.attachments
        .slice(0, 10)
        .map(({ name, url }) => `[${name || "attachment"}](${url})`)
        .join("\n")
        .slice(0, 1024),
    })
  }

  return embed
}

function createDMSelectionComponents(pending, page = 0) {
  const pageSize = 25
  const pageCount = Math.ceil(pending.guilds.length / pageSize)
  const guilds = pending.guilds.slice(page * pageSize, (page + 1) * pageSize)
  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket:dm-server")
        .setPlaceholder("Choose a server")
        .addOptions(
          guilds.map(({ guildId, name }) => ({
            label: name.slice(0, 100),
            value: guildId,
          })),
        ),
    ),
  ]

  if (pageCount > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:dm-page:${page - 1}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`ticket:dm-page:${page + 1}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pageCount - 1),
      ),
    )
  }

  return rows
}

async function findUserTicketGuilds(client, userId) {
  const configuredGuilds = await getConfiguredTicketGuilds()
  const availableGuilds = []

  for (const { guildId } of configuredGuilds) {
    const guild = client.guilds.cache.get(guildId)
    if (!guild) continue

    let member
    try {
      member = await guild.members.fetch(userId)
    } catch (error) {
      if (error.code === 10007) continue
      throw error
    }

    if (member) availableGuilds.push({ guildId, name: guild.name })
  }

  return availableGuilds
}

async function getTicketChannel(client, ticket) {
  const guild = client.guilds.cache.get(ticket.guildId)
  if (!guild) return null

  const channel =
    guild.channels.cache.get(ticket.channelId) ||
    (await guild.channels.fetch(ticket.channelId).catch((error) => {
      if (error.code === 10003) return null
      throw error
    }))

  return channel?.isTextBased() ? channel : null
}

async function getCurrentOpenTicket(client, ownerId) {
  const ticket = await getOpenTicketByUser(ownerId)
  if (!ticket) return null

  const channel = await getTicketChannel(client, ticket)
  if (channel) return ticket

  console.warn(
    `Closing stale ticket record for user ${ownerId}; channel ${ticket.channelId} is unavailable.`,
  )
  await updateTicket(ticket.channelId, {
    status: "closed",
    closedAt: new Date().toISOString(),
    closeReason: "Ticket channel unavailable",
  })

  return null
}

async function createTicket({
  guild,
  user,
  ticketConfig,
  source,
  subject,
  details,
  initialMessages = [],
}) {
  const existing = await getCurrentOpenTicket(guild.client, user.id)
  if (existing) {
    const error = new Error("You already have an open ticket")
    error.code = "TICKET_ALREADY_OPEN"
    error.ticket = existing
    throw error
  }

  const channelName = `ticket-${safeChannelName(user.username)}-${Date.now()
    .toString(36)
    .slice(-5)}`

  const channel = await guild.channels.create({
    name: channelName.slice(0, 100),
    type: ChannelType.GuildText,
    parent: ticketConfig.categoryId,
    topic: `RixelBot ticket | owner:${user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          ...(source === "panel" ? [PermissionFlagsBits.SendMessages] : []),
        ],
        deny:
          source === "dm" ? [PermissionFlagsBits.SendMessages] : undefined,
      },
      {
        id: ticketConfig.supportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
    reason: `Support ticket opened by ${user.tag}`,
  })

  let ticket
  try {
    ticket = await createTicketRecord({
      guildId: guild.id,
      channelId: channel.id,
      categoryId: ticketConfig.categoryId,
      supportRoleId: ticketConfig.supportRoleId,
      transcriptChannelId: ticketConfig.transcriptChannelId,
      ownerId: user.id,
      ownerTag: user.tag,
      subject,
      details,
      source,
    })

    const controlMessage = await channel.send({
      embeds: [createTicketEmbed(ticket)],
      components: createTicketComponents(ticket),
      allowedMentions: { parse: [] },
    })

    ticket = await updateTicket(channel.id, {
      controlMessageId: controlMessage.id,
    })

    for (const message of initialMessages) {
      await channel.send({
        embeds: [createForwardEmbed(user, message)],
        allowedMentions: { parse: [] },
      })
    }

    await notifySupport(guild, ticket, channel).catch((error) =>
      console.error("Could not notify staff about a new ticket:", error),
    )
  } catch (error) {
    if (ticket) {
      await deleteTicketRecord(channel.id).catch((deleteError) =>
        console.error("Could not remove incomplete ticket record:", deleteError),
      )
    }
    await channel.delete("Ticket initialization failed").catch((deleteError) =>
      console.error("Could not remove incomplete ticket channel:", deleteError),
    )

    throw error
  }

  return { ticket, channel }
}

async function sendDMTicketPrompt(message, content, components = []) {
  await message.channel.send({
    content,
    components,
    allowedMentions: { parse: [] },
  })
}

async function handleDirectMessage(message) {
  const existing = await getCurrentOpenTicket(
    message.client,
    message.author.id,
  )
  if (existing) {
    if (existing.source !== "dm") {
      await sendDMTicketPrompt(
        message,
        `You already have an open ticket in ${getTicketLocation(message.client, existing)}. Please continue the conversation in that server channel.`,
      )
      return
    }

    const channel = await getTicketChannel(message.client, existing)
    if (!channel) {
      await sendDMTicketPrompt(
        message,
        "Your open ticket channel is unavailable. Please contact the server staff.",
      )
      return
    }

    await channel.send({
      embeds: [createForwardEmbed(message.author, serializeMessage(message))],
      allowedMentions: { parse: [] },
    })
    return
  }

  let pending = pendingDMs.get(message.author.id)
  if (pending) {
    await remindPendingDM(message, pending)
    return
  }

  const availableGuilds = await findUserTicketGuilds(
    message.client,
    message.author.id,
  )

  pending = pendingDMs.get(message.author.id)
  if (pending) {
    await remindPendingDM(message, pending)
    return
  }

  if (availableGuilds.length === 0) {
    await sendDMTicketPrompt(
      message,
      "No server you belong to currently has tickets configured. Please open a ticket using that server's support panel.",
    )
    return
  }

  if (availableGuilds.length === 1) {
    await openDirectMessageTicket(message, availableGuilds[0].guildId)
    return
  }

  pending = {
    guilds: availableGuilds,
    messages: [serializeMessage(message)],
    page: 0,
    timer: setTimeout(() => pendingDMs.delete(message.author.id), pendingDMTimeout),
  }
  pending.timer.unref?.()
  pendingDMs.set(message.author.id, pending)

  await sendDMTicketPrompt(
    message,
    "Which server should receive your support request?",
    createDMSelectionComponents(pending),
  )
}

async function forwardStaffMessage(message, ticket) {
  const user = await message.client.users.fetch(ticket.ownerId)
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: `Support - ${message.author.tag}`,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(message.content.slice(0, 4000) || "Attachment")
    .setFooter({ text: `Ticket #${ticketNumber(ticket)}` })
    .setTimestamp(message.createdAt)

  if (message.attachments.size > 0) {
    embed.addFields({
      name: "Attachments",
      value: [...message.attachments.values()]
        .slice(0, 10)
        .map(({ name, url }) => `[${name || "attachment"}](${url})`)
        .join("\n")
        .slice(0, 1024),
    })
  }

  await user.send({
    embeds: [embed],
    allowedMentions: { parse: [] },
  })
}

export async function handleTicketGuildMessage(message) {
  if (!message.guild) return false
  const prefix = process.env.PREFIX || "r!"
  if (message.content.startsWith(prefix)) return false
  if (!message.channel.topic?.startsWith("RixelBot ticket | owner:")) {
    return false
  }

  const ticket = await getTicketByChannel(message.channelId)
  if (!ticket || ticket.guildId !== message.guild.id) return false
  if (ticket.status !== "open" || ticket.source !== "dm") return true

  const staff =
    message.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    message.member?.roles.cache.has(ticket.supportRoleId)

  if (!staff) return true

  try {
    await forwardStaffMessage(message, ticket)
  } catch (error) {
    console.error("Could not deliver ticket reply by DM:", error)
    await message.channel.send({
      content: `Could not deliver this reply to <@${ticket.ownerId}>. Their DMs may be closed; please ask them to use the ticket channel instead.`,
      allowedMentions: { users: [ticket.ownerId] },
    })
  }

  return true
}

function formatTranscriptMessage(message) {
  const lines = [
    `[${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id})`,
  ]

  if (message.content) lines.push(message.content)

  for (const attachment of message.attachments.values()) {
    lines.push(`Attachment: ${attachment.name || "file"} - ${attachment.url}`)
  }

  for (const embed of message.embeds) {
    if (embed.title) lines.push(`Embed title: ${embed.title}`)
    if (embed.description) lines.push(`Embed: ${embed.description}`)
  }

  return `${lines.join("\n")}\n`
}

async function notifySupport(guild, ticket, ticketChannel) {
  const notificationChannel = await guild.channels
    .fetch(ticket.transcriptChannelId)
    .catch((error) => {
      if (error.code === 10003) return null
      throw error
    })

  if (!notificationChannel?.isTextBased() || !notificationChannel.send) {
    throw new Error("The configured ticket staff channel is unavailable")
  }
  assertPrivateSupportChannel(
    notificationChannel,
    guild,
    ticket.supportRoleId,
  )

  await notificationChannel.send({
    content: `<@&${ticket.supportRoleId}> New ticket opened: <#${ticketChannel.id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Ticket #${ticketNumber(ticket)} opened`)
        .setDescription(
          `**Member:** <@${ticket.ownerId}>\n**Subject:** ${ticket.subject}`,
        )
        .setTimestamp(new Date(ticket.createdAt)),
    ],
    allowedMentions: {
      parse: [],
      roles: [ticket.supportRoleId],
    },
  })
}

async function createTranscript(channel) {
  const messages = []
  let before

  while (messages.length <= maxTranscriptMessages) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, maxTranscriptMessages + 1 - messages.length),
      ...(before ? { before } : {}),
    })

    if (batch.size === 0) break
    messages.push(...batch.values())
    before = batch.last().id
    if (batch.size < 100) break
  }

  let truncated = messages.length > maxTranscriptMessages
  if (truncated) messages.length = maxTranscriptMessages

  const header = [
    `RixelBot transcript for #${channel.name}`,
    `Guild: ${channel.guild.name} (${channel.guild.id})`,
    `Channel: ${channel.id}`,
  ]
  const transcriptMessages = []
  let transcriptSize = Buffer.byteLength(header.join("\n"), "utf8")

  for (const message of messages) {
    const formatted = formatTranscriptMessage(message)
    const messageSize = Buffer.byteLength(formatted, "utf8")
    if (transcriptSize + messageSize > maxTranscriptBytes) {
      truncated = true
      break
    }

    transcriptMessages.push(formatted)
    transcriptSize += messageSize
  }

  return [
    ...header,
    truncated
      ? `Transcript limited to the latest ${transcriptMessages.length} messages or ${Math.floor(maxTranscriptBytes / 1024 / 1024)} MB.`
      : "",
    "",
    transcriptMessages.reverse().join("\n"),
  ]
    .filter(Boolean)
    .join("\n")
}

async function sendTranscript(ticket, channel) {
  const transcriptChannel = ticket.transcriptChannelId
    ? await channel.guild.channels
        .fetch(ticket.transcriptChannelId)
        .catch((error) => {
          if (error.code === 10003) return null
          throw error
        })
    : null

  if (!transcriptChannel?.isTextBased() || !transcriptChannel.send) {
    throw new Error("The configured ticket transcript channel is unavailable")
  }
  assertPrivateSupportChannel(
    transcriptChannel,
    channel.guild,
    ticket.supportRoleId,
  )

  const transcript = await createTranscript(channel)
  const attachment = new AttachmentBuilder(
    Buffer.from(transcript, "utf8"),
    { name: `ticket-${ticketNumber(ticket)}-transcript.txt` },
  )

  await transcriptChannel.send({
    content: `Transcript for ticket #${ticketNumber(ticket)} | <@${ticket.ownerId}> | ${ticket.subject}`,
    files: [attachment],
    allowedMentions: { parse: [] },
  })
}

async function updateTicketControlMessage(channel, ticket) {
  if (!ticket.controlMessageId) return

  const message = await channel.messages.fetch(ticket.controlMessageId)
  await message.edit({
    embeds: [createTicketEmbed(ticket)],
    components: createTicketComponents(ticket),
    allowedMentions: { parse: [] },
  })
}

async function handleTicketButton(interaction) {
  if (interaction.customId === "ticket:open") {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Open tickets from the server support panel.",
        ephemeral: true,
      })
      return true
    }

    await interaction.showModal(createOpenTicketModal())
    return true
  }

  if (interaction.customId.startsWith("ticket:dm-page:")) {
    const pending = pendingDMs.get(interaction.user.id)
    if (!pending) {
      await interaction.update({
        content: "This selection has expired. Send the bot a new message to start again.",
        components: [],
      })
      return true
    }

    pending.page = Number(interaction.customId.split(":").at(-1))
    await interaction.update({
      content: "Which server should receive your support request?",
      components: createDMSelectionComponents(pending, pending.page),
    })
    return true
  }

  const match = interaction.customId.match(/^ticket:(claim|close|reopen):(\d+)$/)
  if (!match) return false

  const [, action, channelId] = match
  const ticket = await getTicketByChannel(channelId)
  if (!ticket || ticket.guildId !== interaction.guildId) {
    await interaction.reply({
      content: "This ticket no longer exists.",
      ephemeral: true,
    })
    return true
  }

  const guildConfig = await getGuildConfig(ticket.guildId)
  const ticketConfig = guildConfig.ticketConfig
  if (!ticketConfig) {
    await interaction.reply({
      content: "Ticket configuration is missing. Please contact an administrator.",
      ephemeral: true,
    })
    return true
  }

  const isStaff = isSupportStaff(interaction, ticket)

  if (action === "claim") {
    if (!isStaff) {
      await interaction.reply({
        content: "Only the support team can claim tickets.",
        ephemeral: true,
      })
      return true
    }
    if (ticket.status !== "open") {
      await interaction.reply({
        content: "Closed tickets cannot be claimed.",
        ephemeral: true,
      })
      return true
    }
    if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
      await interaction.reply({
        content: "This ticket has already been claimed by another staff member.",
        ephemeral: true,
      })
      return true
    }

    const updatedTicket = await updateTicket(channelId, {
      claimedBy: interaction.user.id,
    })
    const channel = await getTicketChannel(interaction.client, updatedTicket)
    if (!channel) throw new Error("Ticket channel is unavailable")
    await updateTicketControlMessage(channel, updatedTicket)
    await interaction.reply({
      content: `You claimed ticket #${ticketNumber(updatedTicket)}.`,
      ephemeral: true,
    })
    return true
  }

  if (action === "close") {
    if (!isStaff && interaction.user.id !== ticket.ownerId) {
      await interaction.reply({
        content: "Only the ticket owner or support team can close this ticket.",
        ephemeral: true,
      })
      return true
    }
    if (ticket.status !== "open") {
      await interaction.reply({
        content: "This ticket is already closed.",
        ephemeral: true,
      })
      return true
    }

    await interaction.deferReply({ ephemeral: true })
    const channel = await getTicketChannel(interaction.client, ticket)
    if (!channel) throw new Error("Ticket channel is unavailable")

    const originalName = channel.name
    const originalParentId = channel.parentId
    let updatedTicket
    try {
      await channel.permissionOverwrites.edit(ticket.ownerId, {
        SendMessages: false,
      })
      await channel.permissionOverwrites.edit(ticket.supportRoleId, {
        SendMessages: false,
      })
      await channel.setName(`closed-${originalName}`.slice(0, 100))
      await channel.setParent(null, { lockPermissions: false })
      await channel.send({
        content: `Ticket closed by ${interaction.user.tag}.`,
        allowedMentions: { parse: [] },
      })
      updatedTicket = await updateTicket(channelId, {
        status: "closed",
        closedAt: new Date().toISOString(),
      })
      await updateTicketControlMessage(channel, updatedTicket)
    } catch (error) {
      if (updatedTicket) {
        await updateTicket(channelId, {
          status: "open",
          closedAt: null,
        }).catch((rollbackError) =>
          console.error("Could not restore ticket status after close failure:", rollbackError),
        )
      }
      await channel.permissionOverwrites
        .edit(ticket.ownerId, {
          SendMessages: ticket.source === "panel",
        })
        .catch((rollbackError) =>
          console.error("Could not restore ticket permissions:", rollbackError),
        )
      await channel.permissionOverwrites
        .edit(ticket.supportRoleId, { SendMessages: true })
        .catch((rollbackError) =>
          console.error("Could not restore support-role permissions:", rollbackError),
        )
      await channel.setName(originalName).catch((rollbackError) =>
        console.error("Could not restore ticket channel name:", rollbackError),
      )
      if (originalParentId) {
        await channel
          .setParent(originalParentId, { lockPermissions: false })
          .catch((rollbackError) =>
            console.error("Could not restore ticket category:", rollbackError),
          )
      }
      throw error
    }

    try {
      await sendTranscript(updatedTicket, channel)
      await interaction.editReply("Ticket closed and transcript saved.")
    } catch (error) {
      console.error("Ticket closed, but transcript delivery failed:", error)
      await interaction.editReply(
        "Ticket closed, but its transcript could not be saved. Please contact an administrator.",
      )
    }
    return true
  }

  if (!isStaff) {
    await interaction.reply({
      content: "Only the support team can reopen tickets.",
      ephemeral: true,
    })
    return true
  }
  if (ticket.status !== "closed") {
    await interaction.reply({
      content: "This ticket is already open.",
      ephemeral: true,
    })
    return true
  }

  const channel = await getTicketChannel(interaction.client, ticket)
  if (!channel) throw new Error("Ticket channel is unavailable")

  const originalName = channel.name
  const originalParentId = channel.parentId
  let updatedTicket
  try {
    await channel.permissionOverwrites.edit(ticket.ownerId, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: ticket.source === "panel",
    })
    await channel.permissionOverwrites.edit(ticket.supportRoleId, {
      SendMessages: true,
    })
    await channel.setParent(ticket.categoryId, {
      lockPermissions: false,
    })
    await channel.setName(
      `ticket-${safeChannelName(ticket.ownerTag.split("#")[0])}-${ticketNumber(ticket)}`.slice(
        0,
        100,
      ),
    )
    await channel.send({
      content: `Ticket reopened by ${interaction.user.tag}.`,
      allowedMentions: { parse: [] },
    })
    updatedTicket = await updateTicket(channelId, {
      status: "open",
      closedAt: null,
    })
    await updateTicketControlMessage(channel, updatedTicket)
  } catch (error) {
    if (updatedTicket) {
      await updateTicket(channelId, {
        status: "closed",
        closedAt: ticket.closedAt,
      }).catch((rollbackError) =>
        console.error("Could not restore ticket status after reopen failure:", rollbackError),
      )
    }
    await channel.permissionOverwrites
      .edit(ticket.ownerId, { SendMessages: false })
      .catch((rollbackError) =>
        console.error("Could not restore closed ticket permissions:", rollbackError),
      )
    await channel.permissionOverwrites
      .edit(ticket.supportRoleId, { SendMessages: false })
      .catch((rollbackError) =>
        console.error("Could not restore support-role permissions:", rollbackError),
      )
    await channel.setName(originalName).catch((rollbackError) =>
      console.error("Could not restore ticket channel name:", rollbackError),
    )
    await channel
      .setParent(originalParentId, { lockPermissions: false })
      .catch((rollbackError) =>
        console.error("Could not restore ticket category:", rollbackError),
      )
    throw error
  }

  await interaction.reply({
    content: `Ticket #${ticketNumber(updatedTicket)} reopened.`,
    ephemeral: true,
  })
  return true
}

async function handleTicketSelect(interaction) {
  if (interaction.customId !== "ticket:dm-server") return false

  const pending = pendingDMs.get(interaction.user.id)
  if (!pending) {
    await interaction.update({
      content: "This selection has expired. Send the bot a new message to start again.",
      components: [],
    })
    return true
  }

  const guildId = interaction.values[0]
  if (!pending.guilds.some((guild) => guild.guildId === guildId)) {
    await interaction.update({
      content: "That server is not available in this selection. Send the bot a new message to start again.",
      components: [],
    })
    return true
  }

  clearTimeout(pending.timer)
  pendingDMs.delete(interaction.user.id)

  try {
    const guildConfig = await getGuildConfig(guildId)
    const guild = interaction.client.guilds.cache.get(guildId)
    const member = guild
      ? await guild.members.fetch(interaction.user.id).catch((error) => {
          if (error.code === 10007) return null
          throw error
        })
      : null

    if (!guild || !member || !guildConfig.ticketConfig) {
      await interaction.update({
        content: "You are no longer eligible to open a ticket in that server.",
        components: [],
      })
      return true
    }

    const existing = await getCurrentOpenTicket(
      interaction.client,
      interaction.user.id,
    )
    if (existing) {
      await interaction.update({
        content: `You already have an open ticket in ${getTicketLocation(interaction.client, existing)}.`,
        components: [],
      })
      return true
    }

    await interaction.update({
      content: `Opening your ticket in **${guild.name}**...`,
      components: [],
    })

    await openDirectMessageTicket(
      {
        author: interaction.user,
        client: interaction.client,
        channel: await interaction.user.createDM(),
      },
      guildId,
      pending.messages,
    )
    return true
  } catch (error) {
    console.error("Could not open DM ticket:", error)
    await interaction.followUp({
      content: "Could not open your ticket. Please try again or use the server support panel.",
      ephemeral: true,
    })
    return true
  }
}

async function openDirectMessageTicket(message, guildId, initialMessages) {
  const guild = message.client.guilds.cache.get(guildId)
  if (!guild) throw new Error(`Ticket guild ${guildId} is unavailable`)

  const guildConfig = await getGuildConfig(guild.id)
  const ticketConfig = guildConfig.ticketConfig
  if (!ticketConfig?.categoryId) {
    throw new Error(`Ticket configuration is missing for guild ${guild.id}`)
  }

  const messages = initialMessages || [serializeMessage(message)]
  const firstMessage = messages[0]
  let channel
  try {
    const created = await createTicket({
      guild,
      user: message.author,
      ticketConfig,
      source: "dm",
      subject: "Direct message support request",
      details:
        firstMessage.content.slice(0, 1000) || "The user sent an attachment.",
      initialMessages: messages,
    })
    channel = created.channel
  } catch (error) {
    if (error.code !== "TICKET_ALREADY_OPEN") throw error

    if (error.ticket.source === "dm") {
      const existingChannel = await getTicketChannel(message.client, error.ticket)
      if (existingChannel) {
        for (const pendingMessage of messages) {
          await existingChannel.send({
            embeds: [createForwardEmbed(message.author, pendingMessage)],
            allowedMentions: { parse: [] },
          })
        }
        await sendDMTicketPrompt(
          message,
          `Your message was added to the open ticket in ${getTicketLocation(message.client, error.ticket)}.`,
        )
        return
      }
    }

    await sendDMTicketPrompt(
      message,
      `You already have an open ticket in ${getTicketLocation(message.client, error.ticket)}. Please continue there.`,
    )
    return
  }

  await sendDMTicketPrompt(
    message,
    `Your support ticket was created in **${guild.name}** as <#${channel.id}>. Send follow-up messages in this DM and the support team will receive them here.`,
  )
}

async function handleTicketModal(interaction) {
  if (interaction.customId !== "ticket:open-modal") return false
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Tickets can only be opened from a server support panel.",
      ephemeral: true,
    })
    return true
  }

  await interaction.deferReply({ ephemeral: true })
  const guildConfig = await getGuildConfig(interaction.guildId)
  const ticketConfig = guildConfig.ticketConfig
  const subject = interaction.fields.getTextInputValue("subject").trim()
  const details = interaction.fields.getTextInputValue("details").trim()

  if (!ticketConfig?.categoryId) {
    await interaction.editReply(
      "Tickets are not configured in this server. Please contact an administrator.",
    )
    return true
  }

  if (!subject || !details) {
    await interaction.editReply(
      "Please provide both a ticket subject and a description.",
    )
    return true
  }

  try {
    const { ticket, channel } = await createTicket({
      guild: interaction.guild,
      user: interaction.user,
      ticketConfig,
      source: "panel",
      subject,
      details,
    })

    await interaction.editReply(
      `Your ticket was created: <#${channel.id}> (ticket #${ticketNumber(ticket)}).`,
    )
  } catch (error) {
    if (error.code === "TICKET_ALREADY_OPEN") {
      await interaction.editReply(
        `You already have an open ticket in ${getTicketLocation(interaction.client, error.ticket)}.`,
      )
      return true
    }
    throw error
  }

  return true
}

export async function handleTicketDirectMessage(message) {
  await handleDirectMessage(message)
}

export async function handleTicketInteraction(interaction) {
  if (interaction.isButton()) return handleTicketButton(interaction)
  if (interaction.isStringSelectMenu()) return handleTicketSelect(interaction)
  if (interaction.isModalSubmit()) return handleTicketModal(interaction)
  return false
}

export async function installTicketPanel(channel, previousMessageId) {
  const payload = {
    embeds: [createPanelEmbed()],
    components: createPanelComponents(),
    allowedMentions: { parse: [] },
  }

  if (previousMessageId) {
    const previousMessage = await channel.messages
      .fetch(previousMessageId)
      .catch((error) => {
        if (error.code === 10008) return null
        throw error
      })

    if (previousMessage) return previousMessage.edit(payload)
  }

  return channel.send(payload)
}
