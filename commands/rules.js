import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js"

function createRulesEmbeds() {
  const color = 0x940000

  // 1. Embed Principal / Introducción
  const mainEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("📜 REGLAS DEL SERVER")
    .setDescription(
      "⚬──────────✧──────────⚬\nPor favor, lee y sigue las reglas del servidor para asegurar un entorno seguro y disfrutable para todos.",
    )

  const discordEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("1 → DIRECTRICES DE DISCORD")
    .setDescription(
      "Antes de cumplir con las reglas del server, es importante también cumplir con las ya impuestas por Discord, así como sus términos:\n\n**Normas de la plataforma:** https://discord.com/guidelines \n**Términos de servicio:** https://discord.com/terms",
    )

  const generalEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("2 → GENERALES")
    .setDescription(
      "- Ser respetuosos con todos los miembros del servidor.\n- No hacerle bromas a otros. Si le harás una broma a alguien, ten pendiente que debes de tener confianza con esa persona, ya que él o ella tal vez no tenga tu mismo sentido del humor y no lo entienda u ofenda.\n- No hablar sobre temas delicados como política, religión, fútbol, sexo o cualquier otro tema que pueda despertar sensibilidades.\n- No insultes a otros, a menos que sean amigos y no tengan ningún problema.\n- Respetar ante todo al STAFF.\n- No cuestionar las acciones de los miembros del STAFF.\n- Respetar las creencias, culturas/sub-culturas, formas de ser, apariencias y forma de hablar de los demás.\n- No hablar, incitar, enviar imágenes y/o videos o algo parecido sobre temas +18, para ellos se tendrán los debidos canales.\n- No uses ningún bot para jugar haciendo el tonto o para hacer algo no debido. Al igual, no está permitido el contenido NSFW.\n- El uso de el @everyone y @here está permitido solo a los Administradores.",
    )

  const chatEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("3 → CHAT")
    .setDescription(
      "- Tener una ortografía/escritura moderada, además de entendible con facilidad.\n- No escribir comentarios ofensivos sin razón ni por diversión, en el servidor se quiere mantener un ambiente NO TÓXICO.\n- No spamear el chat de menciones, emojis y/o emoticones, como por ejemplo, el pacman (:v).\n- No usar mayúsculas excesivas ni alargamientos de palabras.\n- Respetar a otro mientras se encuentra hablando.",
    )

  const voiceEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("4 → VOZ")
    .setDescription(
      "- No abusar de una sala de voz, si la estás abarcando solo porque sí, y no le permites a otros usarla, recibirás una advertencia y perderás el derecho de usar las salas de voz por una semana. Si no estas de acuerdo con esto debes de recordar que buscamos mantener un ambiente no toxico a toda costa.\n- No soplar ni saturar vuestros microfonos para molestar.\n- No gritar, hablar demasiado rápido o repetir lo mismo repetidas veces.",
    )

  const staffEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("5 → GRUPOS ADMINISTRATIVOS")
    .setDescription(
      "- No bannear, kickear o mutear a alguien sin razones. Si se te otorgó poder en el servidor es porque se confía en ti, así que no abuses de eso.\n- No mutear ni ensordecer a alguien en los canales de voz sin razones, esto a de tener el mismo sentido de la anterior regla.\n- No mostrarse superior a otros solo por tener un rol, a fin de cuentas, un rol es eso, solo un rol que se puede tanto quitar como poner.\n- Respetar a los que no son miembros del STAFF, al igual que ellos a ustedes.\n- No abusar de sus privilegios para crear, eliminar u ocultar canales solo por poder, si es que pueden.\n\n⚬──────────✧──────────⚬",
    )
    .setFooter({
      text: "RixelBot • Administración",
    })

  return [
    mainEmbed,
    discordEmbed,
    generalEmbed,
    chatEmbed,
    voiceEmbed,
    staffEmbed,
  ]
}

export default {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Shows the server rules. (Administration only)"),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return await interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      })
    }

    if (
      !interaction.guild.members.me.permissions.has(
        PermissionFlagsBits.Administrator,
      )
    ) {
      return await interaction.reply({
        content: "❌ I do not have permission to execute this command.",
        ephemeral: true,
      })
    }

    const embeds = createRulesEmbeds()
    await interaction.reply({ embeds: embeds })
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await message.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true,
      })
    }

    if (
      !message.guild.members.me.permissions.has(
        PermissionFlagsBits.Administrator,
      )
    ) {
      return await message.reply({
        content: "❌ I do not have permission to execute this command.",
        ephemeral: true,
      })
    }

    const embeds = createRulesEmbeds()
    await message.channel.send({ embeds: embeds })
    await message
      .delete()
      .catch((error) =>
        console.error("Failed to delete the command message:", error),
      )
  },
}
