export function registerEvents(client) {
  client.once("ready", (readyClient) => {
    console.log("-----------------------------")
    console.log(`Bot connected: ${readyClient.user.tag}`)
    console.log(`ID: ${readyClient.user.id}`)
    console.log("Status: ONLINE")
    console.log("-----------------------------")
  })
}
