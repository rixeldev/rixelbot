#!/usr/bin/env node

import { execFile } from "node:child_process"
import { mkdir, readFile, rename, statfs, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const serviceName = process.env.MONITOR_SERVICE || "rixelbot"
const healthUrl =
  process.env.HEALTH_URL ||
  `http://127.0.0.1:${process.env.PORT || 3000}/health`
const statePath =
  process.env.MONITOR_STATE || "/var/lib/rixelbot/monitor-state.json"
const dataDirectory = process.env.DATA_DIR || "/var/lib/rixelbot/data"
const webhookUrl = process.env.ALERT_WEBHOOK_URL || ""

const alertCooldownMs = Number(process.env.ALERT_COOLDOWN_MS || 1_800_000)
const memoryLimitMb = Number(process.env.ALERT_MEMORY_MB || 512)
const diskLimitPercent = Number(process.env.ALERT_DISK_PERCENT || 85)
const trafficLimitMbps = Number(process.env.ALERT_MBPS || 50)
const latencyLimitMs = Number(process.env.ALERT_LATENCY_MS || 2_000)

/**
 * Decides which alerts and recovery notices to emit for this run.
 *
 * - A problem alerts at most once every `cooldownMs`.
 * - A problem that disappears emits one recovery notice and clears its
 *   cooldown, so a later recurrence alerts immediately.
 */
export function planAlerts(state, problems, now, cooldownMs) {
  state.alerts ??= {}
  state.active ??= {}

  const currentKinds = new Set(problems.map(([kind]) => kind))
  const alerts = []
  const recovered = []

  for (const [kind, message] of problems) {
    state.active[kind] ??= { message, since: now }
    state.active[kind].message = message

    const lastAlert = state.alerts[kind]

    if (lastAlert === undefined || now - lastAlert >= cooldownMs) {
      state.alerts[kind] = now
      alerts.push({ kind, message })
    }
  }

  for (const [kind, active] of Object.entries(state.active)) {
    if (currentKinds.has(kind)) continue

    const minutes = Math.max(1, Math.round((now - active.since) / 60_000))

    recovered.push({
      kind,
      message: `${active.message} (resolved after ${minutes} min)`,
    })

    delete state.active[kind]
    delete state.alerts[kind]
  }

  return { alerts, recovered }
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return { alerts: {}, active: {}, sample: null, day: null }
    throw error
  }
}

async function writeState(state) {
  await mkdir(path.dirname(statePath), { recursive: true })

  const temporaryPath = `${statePath}.${process.pid}.tmp`

  await writeFile(temporaryPath, JSON.stringify(state, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  })
  await rename(temporaryPath, statePath)
}

async function defaultInterface() {
  const routeTable = await readFile("/proc/net/route", "utf8")

  for (const line of routeTable.split("\n").slice(1)) {
    const [name, destination] = line.trim().split(/\s+/)

    if (name && destination === "00000000" && /^[\w.:-]{1,32}$/.test(name)) {
      return name
    }
  }

  return null
}

async function interfaceCounters(name) {
  const read = (statistic) =>
    readFile(`/sys/class/net/${name}/statistics/${statistic}`, "utf8").then(
      (value) => Number.parseInt(value, 10),
    )

  const [rx, tx] = await Promise.all([read("rx_bytes"), read("tx_bytes")])

  return { rx, tx }
}

async function serviceState() {
  const [active, memory] = await Promise.allSettled([
    execFileAsync("systemctl", ["is-active", serviceName]),
    execFileAsync("systemctl", ["show", serviceName, "-p", "MemoryCurrent"]),
  ])

  const isActive =
    active.status === "fulfilled" && active.value.stdout.trim() === "active"

  const memoryMatch =
    memory.status === "fulfilled" ? memory.value.stdout.match(/=(\d+)/) : null

  const memoryMb = memoryMatch
    ? Math.round(Number(memoryMatch[1]) / 1024 / 1024)
    : null

  return { isActive, memoryMb }
}

async function diskUsagePercent() {
  const stats = await statfs(dataDirectory)
  const used = stats.blocks - stats.bfree

  return Math.round((used / stats.blocks) * 100)
}

async function sendMessage(text) {
  const message = `[RixelBot] ${text}`

  if (!webhookUrl) {
    console.error(`ALERT ${message}`)
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: message }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.error(`ALERT ${message} (webhook responded ${response.status})`)
    }
  } catch (error) {
    console.error(`ALERT ${message} (webhook failed: ${error.message})`)
  }
}

async function checkHealth() {
  const startedAt = Date.now()

  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5_000),
    })

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Date.now() - startedAt }
  }
}

async function main() {
  const now = Date.now()
  const state = await readState()
  const problems = []

  const health = await checkHealth()

  if (!health.ok) {
    problems.push([
      "health",
      `health check failed (status ${health.status}) at ${healthUrl}`,
    ])
  } else if (health.latencyMs > latencyLimitMs) {
    problems.push([
      "latency",
      `health check took ${health.latencyMs} ms (limit ${latencyLimitMs} ms)`,
    ])
  }

  const service = await serviceState()

  if (!service.isActive) {
    problems.push(["service", `${serviceName}.service is not active`])
  }

  if (service.memoryMb !== null && service.memoryMb > memoryLimitMb) {
    problems.push([
      "memory",
      `memory is ${service.memoryMb} MB (limit ${memoryLimitMb} MB)`,
    ])
  }

  const diskPercent = await diskUsagePercent().catch(() => null)

  if (diskPercent !== null && diskPercent > diskLimitPercent) {
    problems.push([
      "disk",
      `data directory is ${diskPercent}% full (limit ${diskLimitPercent}%)`,
    ])
  }

  const traffic = { interface: null, rxMbps: 0, txMbps: 0, day: state.day }

  const interfaceName = await defaultInterface().catch(() => null)

  if (interfaceName) {
    const counters = await interfaceCounters(interfaceName).catch(() => null)
    const previous = state.sample

    if (counters && previous && previous.interface === interfaceName) {
      const elapsedSeconds = (now - previous.timestamp) / 1000

      if (elapsedSeconds > 0) {
        const rxDelta = Math.max(0, counters.rx - previous.rx)
        const txDelta = Math.max(0, counters.tx - previous.tx)

        traffic.interface = interfaceName
        traffic.rxMbps = (rxDelta * 8) / elapsedSeconds / 1e6
        traffic.txMbps = (txDelta * 8) / elapsedSeconds / 1e6

        const today = new Date(now).toISOString().slice(0, 10)
        const day =
          state.day?.date === today
            ? state.day
            : { date: today, rxBytes: 0, txBytes: 0 }

        day.rxBytes += rxDelta
        day.txBytes += txDelta
        traffic.day = day
        state.day = day

        if (traffic.rxMbps + traffic.txMbps > trafficLimitMbps) {
          problems.push([
            "traffic",
            `traffic is ${(traffic.rxMbps + traffic.txMbps).toFixed(1)} Mbps (limit ${trafficLimitMbps} Mbps)`,
          ])
        }
      }
    }

    state.sample = counters
      ? {
          interface: interfaceName,
          rx: counters.rx,
          tx: counters.tx,
          timestamp: now,
        }
      : state.sample
  }

  const { alerts, recovered } = planAlerts(
    state,
    problems,
    now,
    alertCooldownMs,
  )

  for (const alert of alerts) {
    await sendMessage(alert.message)
  }

  for (const notice of recovered) {
    await sendMessage(`recovered: ${notice.message}`)
  }

  await writeState(state)

  const day = traffic.day
  const dayTraffic = day
    ? `${(day.rxBytes / 1e9).toFixed(2)} GB in / ${(day.txBytes / 1e9).toFixed(2)} GB out`
    : "no traffic sample yet"

  console.log(
    [
      health.ok ? "health ok" : "health FAILED",
      `${health.latencyMs} ms`,
      service.isActive ? "service active" : "service INACTIVE",
      service.memoryMb === null ? "memory unknown" : `${service.memoryMb} MB`,
      diskPercent === null ? "disk unknown" : `disk ${diskPercent}%`,
      traffic.interface
        ? `${traffic.rxMbps.toFixed(2)}/${traffic.txMbps.toFixed(2)} Mbps`
        : "traffic unknown",
      `today ${dayTraffic}`,
    ].join(" | "),
  )

  if (alerts.length > 0) {
    process.exitCode = 1
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((error) => {
    console.error("Monitor failed:", error)
    process.exitCode = 1
  })
}
