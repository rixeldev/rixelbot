import { SlashCommandBuilder, ChannelType } from "discord.js"

import {
  isTemporaryChannel,
  getRoomOwner,
  transferRoomOwnership,
  setRoomLocked,
} from "../systems/temporaryVoice.js"

async function getVoiceRoom(member) {
  const channel = member?.voice?.channel

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return { error: "❌ Debes estar conectado a una sala de voz." }
  }

  if (!isTemporaryChannel(member.guild.id, channel.id)) {
    return { error: "❌ Esta no es una sala temporal de RixelBot." }
  }

  return {
    channel,
    ownerId: getRoomOwner(member.guild.id, channel.id),
  }
}

async function claimRoom(member, channel, ownerId) {
  if (ownerId === member.id) {
    return "❌ Ya eres el propietario de esta sala."
  }

  const currentOwner = await member.guild.members
    .fetch(ownerId)
    .catch(() => null)

  if (currentOwner?.voice?.channelId === channel.id) {
    return "❌ El propietario todavía está en la sala."
  }

  if (!channel.members.has(member.id)) {
    return "❌ Debes estar dentro de la sala para reclamarla."
  }

  const transferred = transferRoomOwnership(
    member.guild.id,
    channel.id,
    member.id,
  )

  if (!transferred) {
    return "❌ No se pudo reclamar esta sala."
  }

  return "✅ Ahora eres el propietario de esta sala."
}

async function executeVoiceAction(member, subcommand, options = {}) {
  const result = await getVoiceRoom(member)

  if (result.error) return result.error

  const { channel, ownerId } = result

  if (subcommand === "claim") {
    return claimRoom(member, channel, ownerId)
  }

  if (ownerId !== member.id) {
    return "❌ Solo el propietario puede administrar esta sala."
  }

  switch (subcommand) {
    case "limit": {
      const amount = options.amount

      if (!Number.isInteger(amount) || amount < 0 || amount > 99) {
        return "❌ El límite debe estar entre 0 y 99."
      }

      await channel.setUserLimit(amount)

      return amount === 0
        ? "✅ Tu sala ahora es ilimitada."
        : `✅ Límite establecido en **${amount} usuarios**.`
    }

    case "name": {
      const name = options.name?.trim()

      if (!name || name.length > 100) {
        return "❌ Escribe un nombre válido de hasta 100 caracteres."
      }

      await channel.setName(name)

      return `✅ Nombre cambiado a **${name}**.`
    }

    case "lock": {
      await channel.permissionOverwrites.edit(member.guild.roles.everyone, {
        Connect: false,
      })

      setRoomLocked(member.guild.id, channel.id, true)

      return "🔒 Tu sala ha sido bloqueada."
    }

    case "unlock": {
      await channel.permissionOverwrites.edit(member.guild.roles.everyone, {
        Connect: null,
      })

      setRoomLocked(member.guild.id, channel.id, false)

      return "🔓 Tu sala ha sido desbloqueada."
    }

    case "hide": {
      await channel.permissionOverwrites.edit(member.guild.roles.everyone, {
        ViewChannel: false,
      })

      return "👻 Tu sala ahora está oculta."
    }

    case "unhide": {
      await channel.permissionOverwrites.edit(member.guild.roles.everyone, {
        ViewChannel: null,
      })

      return "👀 Tu sala vuelve a ser visible."
    }

    case "kick": {
      const target = options.target

      if (!target || target.id === member.id) {
        return "❌ Usuario no válido."
      }

      if (target.voice.channelId !== channel.id) {
        return "❌ Ese usuario no está en tu sala."
      }

      await target.voice.disconnect()

      return `✅ **${target.user.tag}** ha sido expulsado de tu sala.`
    }

    case "transfer": {
      const target = options.target

      if (!target || target.id === member.id) {
        return "❌ Usuario no válido."
      }

      if (target.voice.channelId !== channel.id) {
        return "❌ El nuevo propietario debe estar en tu sala."
      }

      const transferred = transferRoomOwnership(
        member.guild.id,
        channel.id,
        target.id,
      )

      if (!transferred) {
        return "❌ No se pudo transferir la propiedad."
      }

      return `✅ **${target.user.tag}** ahora es el propietario de la sala.`
    }

    case "info": {
      const roomData = {
        name: channel.name,
        users: channel.members.size,
        limit: channel.userLimit || "Ilimitado",
        locked:
          channel.permissionOverwrites.cache
            .get(member.guild.id)
            ?.deny.has("Connect") || false,
        hidden:
          channel.permissionOverwrites.cache
            .get(member.guild.id)
            ?.deny.has("ViewChannel") || false,
      }

      return (
        `**🎙️ Información de tu sala**\n\n` +
        `📌 Nombre: ${roomData.name}\n` +
        `👥 Usuarios: ${roomData.users}\n` +
        `🔢 Capacidad: ${roomData.limit}\n` +
        `🔒 Bloqueada: ${roomData.locked ? "Sí" : "No"}\n` +
        `👻 Oculta: ${roomData.hidden ? "Sí" : "No"}`
      )
    }

    default:
      return "❌ Subcomando desconocido."
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Administra tu sala temporal")

    .addSubcommand((sub) =>
      sub
        .setName("limit")
        .setDescription("Cambia el límite de usuarios")
        .addIntegerOption((option) =>
          option
            .setName("cantidad")
            .setDescription("0 para ilimitado")
            .setMinValue(0)
            .setMaxValue(99)
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("name")
        .setDescription("Cambia el nombre de tu sala")
        .addStringOption((option) =>
          option
            .setName("nombre")
            .setDescription("Nuevo nombre")
            .setMaxLength(100)
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub.setName("lock").setDescription("Bloquea tu sala"),
    )

    .addSubcommand((sub) =>
      sub.setName("unlock").setDescription("Desbloquea tu sala"),
    )

    .addSubcommand((sub) =>
      sub.setName("hide").setDescription("Oculta tu sala"),
    )

    .addSubcommand((sub) =>
      sub.setName("unhide").setDescription("Muestra tu sala"),
    )

    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Expulsa a alguien de tu sala")
        .addUserOption((option) =>
          option
            .setName("usuario")
            .setDescription("Usuario que deseas expulsar")
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("transfer")
        .setDescription("Transfiere la propiedad de tu sala")
        .addUserOption((option) =>
          option
            .setName("usuario")
            .setDescription("Nuevo propietario")
            .setRequired(true),
        ),
    )

    .addSubcommand((sub) =>
      sub
        .setName("claim")
        .setDescription("Reclama una sala cuyo propietario se ha ido"),
    )

    .addSubcommand((sub) =>
      sub.setName("info").setDescription("Consulta la información de tu sala"),
    ),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand()
      const options = {}

      if (subcommand === "limit") {
        options.amount = interaction.options.getInteger("cantidad")
      }

      if (subcommand === "name") {
        options.name = interaction.options.getString("nombre")
      }

      if (["kick", "transfer"].includes(subcommand)) {
        const user = interaction.options.getUser("usuario")

        options.target = await interaction.guild.members.fetch(user.id)
      }

      const result = await executeVoiceAction(
        interaction.member,
        subcommand,
        options,
      )

      return interaction.reply({
        content: result,
        ephemeral: true,
      })
    } catch (error) {
      console.error("Voice slash command error:", error)

      const response = {
        content:
          "❌ No se pudo completar la operación. Comprueba los permisos del bot.",
        ephemeral: true,
      }

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(response)
      }

      return interaction.reply(response)
    }
  },

  async executePrefix(message, args) {
    try {
      const subcommand = args.shift()?.toLowerCase()

      if (!subcommand) {
        return message.reply(
          "**🎙️ Comandos de salas temporales**\n\n" +
            "`r!voice limit 5`\n" +
            "`r!voice name Gaming Room`\n" +
            "`r!voice lock`\n" +
            "`r!voice unlock`\n" +
            "`r!voice hide`\n" +
            "`r!voice unhide`\n" +
            "`r!voice kick @usuario`\n" +
            "`r!voice transfer @usuario`\n" +
            "`r!voice claim`\n" +
            "`r!voice info`",
        )
      }

      const options = {}

      if (subcommand === "limit") {
        options.amount = Number(args[0])
      }

      if (subcommand === "name") {
        options.name = args.join(" ")
      }

      if (["kick", "transfer"].includes(subcommand)) {
        const id = args[0]?.replace(/[<@!>]/g, "")

        if (id) {
          options.target = await message.guild.members
            .fetch(id)
            .catch(() => null)
        }
      }

      const result = await executeVoiceAction(
        message.member,
        subcommand,
        options,
      )

      return message.reply(result)
    } catch (error) {
      console.error("Voice prefix command error:", error)

      return message.reply(
        "❌ No se pudo completar la operación. Comprueba los permisos del bot.",
      )
    }
  },
}
