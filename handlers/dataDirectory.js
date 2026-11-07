import { constants } from "node:fs"
import { copyFile, mkdir } from "node:fs/promises"

import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDataDirectory = path.resolve(__dirname, "../data")

export const dataDirectory = path.resolve(
  process.env.DATA_DIR || defaultDataDirectory,
)

export async function initializeDataDirectory() {
  await mkdir(dataDirectory, { recursive: true })

  for (const fileName of ["guild-config.json", "temporaryVoice.json"]) {
    try {
      await copyFile(
        path.join(defaultDataDirectory, fileName),
        path.join(dataDirectory, fileName),
        constants.COPYFILE_EXCL,
      )
    } catch (error) {
      if (error.code !== "EEXIST") throw error
    }
  }
}
