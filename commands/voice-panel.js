import { SlashCommandBuilder } from "discord.js"

import { sendVoiceControlPanel } from "../systems/temporaryVoice.js"

export default {
  data: new SlashCommandBuilder()
    .setName("voice-panel")
    .setDescription("Open your temporary voice room control panel."),

  async execute(interaction) {
    await sendVoiceControlPanel(interaction)
  },
}
