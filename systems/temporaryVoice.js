import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js"

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_PATH = path.join(__dirname, "../data/temporaryVoice.json")

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 99

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"))
  } catch (error) {
    return { guilds: {} }
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 4))
}

function getGuildData(guildId) {
  const data = readData()

  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      generatorChannelId: null,
      temporaryChannels: {},
    }

    saveData(data)
  }

  return data.guilds[guildId]
}

function updateGuildData(guildId, callback) {
  const data = readData()

  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      generatorChannelId: null,
      temporaryChannels: {},
    }
  }

  callback(data.guilds[guildId])
  saveData(data)
}

export function setGeneratorChannel(guildId, channelId) {
  updateGuildData(guildId, (guildData) => {
    guildData.generatorChannelId = channelId
  })
}

export function getGeneratorChannel(guildId) {
  return getGuildData(guildId).generatorChannelId
}

export async function createTemporaryChannel(member) {
  const guild = member.guild
  const guildData = getGuildData(guild.id)

  const generator = guild.channels.cache.get(guildData.generatorChannelId)

  if (!generator || generator.type !== ChannelType.GuildVoice) {
    return null
  }

  const channelName = `🎮 ${member.user.username}'s room`

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: generator.parentId,
    userLimit: DEFAULT_LIMIT,
    permissionOverwrites: [
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
    reason: `Temporary voice channel created for ${member.user.tag}`,
  })

  updateGuildData(guild.id, (guildData) => {
    guildData.temporaryChannels[channel.id] = {
      ownerId: member.id,
      locked: false,
    }
  })

  try {
    await member.voice.setChannel(channel)
  } catch (error) {
    await deleteTemporaryChannel(channel.id, guild)
    throw error
  }

  return channel
}

export async function deleteTemporaryChannel(channelId, guild) {
  const guildData = getGuildData(guild.id)

  if (!guildData.temporaryChannels[channelId]) {
    return
  }

  const channel = guild.channels.cache.get(channelId)

  if (channel) {
    await channel.delete("Temporary voice channel is empty").catch(() => {})
  }

  updateGuildData(guild.id, (guildData) => {
    delete guildData.temporaryChannels[channelId]
  })
}

export async function cleanupTemporaryChannels(client) {
  const data = readData()

  for (const [guildId, guildData] of Object.entries(data.guilds)) {
    const guild = client.guilds.cache.get(guildId)

    if (!guild) continue

    for (const channelId of Object.keys(guildData.temporaryChannels || {})) {
      const channel = guild.channels.cache.get(channelId)

      if (!channel || channel.members.size === 0) {
        await deleteTemporaryChannel(channelId, guild)
      }
    }
  }
}

export function isTemporaryChannel(guildId, channelId) {
  const guildData = getGuildData(guildId)

  return Boolean(guildData.temporaryChannels[channelId])
}

export function getRoomOwner(guildId, channelId) {
  const guildData = getGuildData(guildId)

  return guildData.temporaryChannels[channelId]?.ownerId ?? null
}

export async function handleTemporaryVoiceInteraction(interaction) {
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith("tv:")) {
      return false
    }

    const [, action, channelId] = interaction.customId.split(":")

    const guild = interaction.guild

    if (!guild || !isTemporaryChannel(guild.id, channelId)) {
      await interaction.reply({
        content: "This temporary room no longer exists.",
        ephemeral: true,
      })
      return true
    }

    const channel = guild.channels.cache.get(channelId)
    const ownerId = getRoomOwner(guild.id, channelId)

    if (!channel) {
      await interaction.reply({
        content: "This room is no longer available.",
        ephemeral: true,
      })
      return true
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the room owner can use these controls.",
        ephemeral: true,
      })
      return true
    }

    if (action === "limit-down" || action === "limit-up") {
      const currentLimit = channel.userLimit || 0

      const newLimit =
        action === "limit-up"
          ? Math.min(MAX_LIMIT, Math.max(1, currentLimit + 1))
          : Math.max(0, currentLimit - 1)

      await channel.setUserLimit(newLimit)

      await interaction.reply({
        content: `Room capacity updated to ${newLimit === 0 ? "unlimited" : newLimit}.`,
        ephemeral: true,
      })

      return true
    }

    if (action === "lock") {
      const guildEveryone = guild.roles.everyone

      await channel.permissionOverwrites.edit(guildEveryone, { Connect: false })

      updateGuildData(guild.id, (guildData) => {
        guildData.temporaryChannels[channelId].locked = true
      })

      await interaction.reply({
        content: "🔒 Your room is now locked.",
        ephemeral: true,
      })

      return true
    }

    if (action === "unlock") {
      const guildEveryone = guild.roles.everyone

      await channel.permissionOverwrites.edit(guildEveryone, { Connect: null })

      updateGuildData(guild.id, (guildData) => {
        guildData.temporaryChannels[channelId].locked = false
      })

      await interaction.reply({
        content: "🔓 Your room is now unlocked.",
        ephemeral: true,
      })

      return true
    }

    if (action === "rename") {
      const modal = new ModalBuilder()
        .setCustomId(`tv:rename:${channelId}`)
        .setTitle("Rename your room")

      const nameInput = new TextInputBuilder()
        .setCustomId("room-name")
        .setLabel("New room name")
        .setPlaceholder("Enter a new room name")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true)

      modal.addComponents(new ActionRowBuilder().addComponents(nameInput))

      await interaction.showModal(modal)

      return true
    }

    return true
  }

  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith("tv:rename:")) {
      return false
    }

    const channelId = interaction.customId.split(":")[2]
    const guild = interaction.guild

    if (!guild || !isTemporaryChannel(guild.id, channelId)) {
      await interaction.reply({
        content: "This temporary room no longer exists.",
        ephemeral: true,
      })
      return true
    }

    const ownerId = getRoomOwner(guild.id, channelId)

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the room owner can rename this room.",
        ephemeral: true,
      })
      return true
    }

    const channel = guild.channels.cache.get(channelId)

    if (!channel) {
      await interaction.reply({
        content: "This room is no longer available.",
        ephemeral: true,
      })
      return true
    }

    const newName = interaction.fields.getTextInputValue("room-name").trim()

    if (!newName) {
      await interaction.reply({
        content: "Please enter a valid room name.",
        ephemeral: true,
      })
      return true
    }

    await channel.setName(newName)

    await interaction.reply({
      content: `Your room has been renamed to **${newName}**.`,
      ephemeral: true,
    })

    return true
  }

  return false
}

export async function sendVoiceControlPanel(interaction) {
  const channel = interaction.member.voice.channel

  if (!channel || !isTemporaryChannel(interaction.guild.id, channel.id)) {
    await interaction.reply({
      content: "You must be inside one of your temporary rooms.",
      ephemeral: true,
    })

    return
  }

  const ownerId = getRoomOwner(interaction.guild.id, channel.id)

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Only the room owner can open the control panel.",
      ephemeral: true,
    })

    return
  }

  const guildData = getGuildData(interaction.guild.id)
  const roomData = guildData.temporaryChannels[channel.id]

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎙️ Temporary Room Controls")
    .setDescription(
      `Manage your voice room using the buttons below.\n\n` +
        `**Room:** ${channel.name}\n` +
        `**Capacity:** ${channel.userLimit || "Unlimited"}\n` +
        `**Privacy:** ${roomData.locked ? "Locked 🔒" : "Unlocked 🔓"}`,
    )
    .setFooter({
      text: "Only the room owner can use these controls.",
    })

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tv:limit-down:${channel.id}`)
      .setLabel("Decrease limit")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`tv:limit-up:${channel.id}`)
      .setLabel("Increase limit")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`tv:rename:${channel.id}`)
      .setLabel("Rename")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Primary),
  )

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tv:${roomData.locked ? "unlock" : "lock"}:${channel.id}`)
      .setLabel(roomData.locked ? "Unlock room" : "Lock room")
      .setEmoji(roomData.locked ? "🔓" : "🔒")
      .setStyle(roomData.locked ? ButtonStyle.Success : ButtonStyle.Danger),
  )

  await interaction.reply({
    embeds: [embed],
    components: [row1, row2],
    ephemeral: true,
  })
}

export function transferRoomOwnership(guildId, channelId, newOwnerId) {
  let updated = false

  updateGuildData(guildId, (guildData) => {
    const room = guildData.temporaryChannels[channelId]

    if (!room) return

    room.ownerId = newOwnerId
    updated = true
  })

  return updated
}

export function setRoomLocked(guildId, channelId, locked) {
  let updated = false

  updateGuildData(guildId, (guildData) => {
    const room = guildData.temporaryChannels[channelId]

    if (!room) return

    room.locked = locked
    updated = true
  })

  return updated
}
