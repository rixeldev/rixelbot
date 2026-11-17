import { appendFile, mkdir } from "node:fs/promises"

import path from "node:path"
import { dataDirectory } from "./dataDirectory.js"

export const auditDirectory = path.join(dataDirectory, "audit")

const maxStringLength = 200

let writeQueue = Promise.resolve()

/**
 * Removes control characters and caps the length of values written to the
 * audit log so untrusted input cannot forge or bloat log lines.
 */
export function sanitizeLogValue(value) {
  if (value === undefined || value === null) return undefined

  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, maxStringLength)
}

function currentLogPath(date = new Date()) {
  const month = date.toISOString().slice(0, 7)

  return path.join(auditDirectory, `audit-${month}.jsonl`)
}

/**
 * Appends one structured event to the monthly audit log. Errors are reported
 * to the console but never propagate: auditing must not break a command.
 */
export function recordAuditEvent(event) {
  const entry = { timestamp: new Date().toISOString() }

  for (const [key, value] of Object.entries(event)) {
    entry[key] = sanitizeLogValue(value)
  }

  const line = `${JSON.stringify(entry)}\n`

  const operation = writeQueue.then(async () => {
    await mkdir(auditDirectory, { recursive: true })

    await appendFile(currentLogPath(), line, {
      encoding: "utf8",
      mode: 0o600,
    })
  })

  writeQueue = operation.catch((error) => {
    console.error("Could not write audit log event:", error)
  })

  return writeQueue
}

export async function flushAuditLog() {
  await writeQueue
}
