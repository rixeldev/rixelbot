import { createWebhookNotifier } from "../handlers/webhookNotifier.js"

const defaultGatewayCooldownMs = Number(
  process.env.NOTIFY_GATEWAY_COOLDOWN_MS || 300_000,
)

const defaultReconnectThresholdMs = Number(
  process.env.NOTIFY_RECONNECT_MS || 60_000,
)

/**
 * Reports the bot's own lifecycle to the alert webhook: when it comes online,
 * when the Discord gateway drops and when it comes back.
 *
 * Short reconnects (below `reconnectThresholdMs`) stay silent, because a laptop
 * Wi-Fi blip can resume the session in a few seconds. The close code is always
 * written to the journal so the cause can be inspected later.
 */
export function registerGatewayNotifications(client, options = {}) {
  const {
    notifier = createWebhookNotifier({ cooldownMs: defaultGatewayCooldownMs }),
    reconnectThresholdMs = defaultReconnectThresholdMs,
    now = Date.now,
  } = options

  const downSince = new Map()

  client.once("ready", (readyClient) => {
    notifier.notify(
      "online",
      `online as ${readyClient.user.tag} (${readyClient.guilds.cache.size} server(s))`,
    )

    for (const shard of client.ws?.shards?.values() ?? []) {
      shard.on("closed", ({ code, reason }) => {
        console.warn(
          `Gateway shard ${shard.id} closed: code=${code}${reason ? ` reason=${reason}` : ""}`,
        )
      })
    }
  })

  client.on("shardReconnecting", (shardId) => {
    downSince.set(shardId, now())
  })

  client.on("shardResume", (shardId, replayedEvents) => {
    const startedAt = downSince.get(shardId)
    downSince.delete(shardId)

    const downMs = startedAt === undefined ? 0 : now() - startedAt

    if (downMs < reconnectThresholdMs) return

    notifier.notify(
      "resume",
      `reconnected after ${Math.round(downMs / 1000)}s (shard ${shardId}, ${replayedEvents} events replayed)`,
    )
  })

  client.on("shardDisconnect", (closeEvent, shardId) => {
    notifier.notify(
      "disconnect",
      `disconnected from Discord and not retrying (code ${closeEvent?.code ?? "unknown"}, shard ${shardId})`,
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
