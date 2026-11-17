import { randomUUID } from "node:crypto"
import { rename, rm, writeFile } from "node:fs/promises"

/**
 * Writes a JSON file atomically (temporary file + rename) so a crash or a
 * full disk cannot leave a truncated database behind.
 */
export async function writeJsonFile(filePath, value, { spacing = 2 } = {}) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`

  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, spacing), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
