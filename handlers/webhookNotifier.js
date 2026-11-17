import { mkdir, readFile, rename, writeFile } from "node:fs/promises"

import path from "node:path"
import { dataDirectory } from "./dataDirectory.js"

export const defaultNotifyStatePath = path.join(
  dataDirectory,
  "notify-state.json",
)

export const defaultCooldownMs = 60_000

export function isCooldownExpired(lastSentAt, now, cooldownMs) {
  return lastSentAt === undefined || now - lastSentAt >= cooldownMs
}

/**
 * Sends throttled notifications to the alert webhook. The last send time per
 * kind is persisted so a restart loop cannot flood the channel.
 */
export function createWebhookNotifier({
  webhookUrl = process.env.ALERT_WEBHOOK_URL || "",
  statePath = process.env.NOTIFY_STATE || defaultNotifyStatePath,
  cooldownMs = Number(process.env.NOTIFY_COOLDOWN_MS || defaultCooldownMs),
  now = Date.now,
} = {}) {
  let state = null
  let writeQueue = Promise.resolve()

  async function load() {
    if (state) return state

    try {
      state = JSON.parse(await readFile(statePath, "utf8"))
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Could not read notify state:", error)
      }
      state = {}
    }

    state.last ??= {}

    return state
  }

  async function persist() {
    const operation = writeQueue.then(async () => {
      await mkdir(path.dirname(statePath), { recursive: true })

      const temporaryPath = `${statePath}.${process.pid}.tmp`

      await writeFile(temporaryPath, JSON.stringify(state, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      })
      await rename(temporaryPath, statePath)
    })

    writeQueue = operation.catch((error) => {
      console.error("Could not persist notify state:", error)
    })

    return writeQueue
  }

  async function deliver(text) {
    if (!webhookUrl) {
      console.info(`NOTIFY ${text}`)
      return
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        console.error(`NOTIFY ${text} (webhook responded ${response.status})`)
      }
    } catch (error) {
      console.error(`NOTIFY ${text} (webhook failed: ${error.message})`)
    }
  }

  return {
    async notify(kind, message) {
      const timestamp = now()
      const current = await load()

      if (!isCooldownExpired(current.last[kind], timestamp, cooldownMs)) {
        return false
      }

      current.last[kind] = timestamp
      await persist()

      await deliver(`[RixelBot] ${message}`)

      return true
    },

    async flush() {
      await writeQueue
    },
  }
}
