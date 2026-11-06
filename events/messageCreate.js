export function registerMessageHandler(client) {
  client.on("messageCreate", async (message) => {
    // Ignore messages from bots and messages not in a guild
    if (message.author.bot || !message.guild) return

    const prefix = process.env.PREFIX || "r!"

    // Check the prefix
    if (!message.content.startsWith(prefix)) return

    // Separate command and arguments
    const args = message.content.slice(prefix.length).trim().split(/\s+/)

    const commandName = args.shift()?.toLowerCase()

    if (!commandName) return

    const command = client.commands.get(commandName)

    if (!command || typeof command.executePrefix !== "function") return

    try {
      await command.executePrefix(message, args)
    } catch (error) {
      console.error(`Error in command ${commandName}:`, error)

      await message.reply("❌ An error occurred while executing this command.")
    }
  })
}
