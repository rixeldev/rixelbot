import { createWebhookNotifier } from "../handlers/webhookNotifier.js"

const gatewayCooldownMs = Number(
  process.env.NOTIFY_GATEWAY_COOLDOWN_MS || 300_000,
)

/**
 * Reports the bot's own lifecycle to the alert webhook: when it comes online,
 * when the Discord gateway drops, and when it comes back.
 */
export function registerGatewayNotifications(client, options = {}) {
  const notifier = createWebhookNotifier({
    cooldownMs: gatewayCooldownMs,
    ...options,
  })

  client.once("ready", (readyClient) => {
    notifier.notify(
      "online",
      `online as ${readyClient.user.tag} (${readyClient.guilds.cache.size} server(s))`,
    )
  })

  client.on("shardDisconnect", (closeEvent, shardId) => {
    notifier.notify(
      "disconnect",
      `disconnected from Discord (code ${closeEvent?.code ?? "unknown"}, shard ${shardId})`,
    )
  })

  client.on("shardResume", (shardId, replayedEvents) => {
    notifier.notify(
      "resume",
      `reconnected to Discord (shard ${shardId}, ${replayedEvents} events replayed)`,
    )
  })

  client.on("shardError", (error, shardId) => {
    notifier.notify(
      "gateway-error",
      `gateway error on shard ${shardId}: ${error.message}`,
    )
  })

  return notifier
}
