#!/usr/bin/env node

import { pathToFileURL } from "node:url"

import { createWebhookNotifier } from "../handlers/webhookNotifier.js"

/**
 * Turns systemd's $SERVICE_RESULT/$EXIT_CODE/$EXIT_STATUS into a readable
 * message. A clean stop (shutdown, manual restart) returns null so routine
 * reboots stay silent.
 */
export function describeServiceStop({
  serviceResult,
  exitCode,
  exitStatus,
  mainPid,
} = {}) {
  if (!serviceResult || serviceResult === "success") return null

  const pid = mainPid && mainPid !== "0" ? `, pid ${mainPid}` : ""

  switch (serviceResult) {
    case "exit-code":
      return `stopped unexpectedly (exit status ${exitStatus ?? exitCode ?? "unknown"}${pid})`
    case "signal":
      return `stopped by signal ${exitStatus || exitCode || "unknown"}${pid}`
    case "core-dump":
      return `crashed and dumped core${exitStatus ? ` (signal ${exitStatus})` : ""}${pid}`
    case "resources":
      return `stopped: resource limit reached${pid}`
    case "timeout":
      return `stopped: startup or shutdown timed out${pid}`
    case "watchdog":
      return `stopped: watchdog timeout${pid}`
    case "start-limit-hit":
      return "stopped: too many restarts, systemd gave up"
    default:
      return `stopped: ${serviceResult}${pid}`
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const event = process.argv[2] || "stopped"

  const message =
    event === "started"
      ? `service started (pid ${process.env.MAINPID || "unknown"})`
      : describeServiceStop({
          serviceResult: process.env.SERVICE_RESULT,
          exitCode: process.env.EXIT_CODE,
          exitStatus: process.env.EXIT_STATUS,
          mainPid: process.env.MAINPID,
        })

  if (message) {
    const notifier = createWebhookNotifier()

    notifier
      .notify(event, message)
      .catch((error) => console.error("Could not send service notice:", error))
      .finally(() => notifier.flush())
  }
}
