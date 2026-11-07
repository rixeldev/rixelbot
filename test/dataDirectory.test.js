import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

test("initial data files seed a new data directory without overwriting it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rixelbot-data-"))
  const previousDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = directory

  try {
    const { initializeDataDirectory } = await import(
      `../handlers/dataDirectory.js?test=${Date.now()}`
    )

    await initializeDataDirectory()

    const seededConfig = await readFile(
      path.join(directory, "guild-config.json"),
      "utf8",
    )
    assert.ok(JSON.parse(seededConfig))

    await writeFile(path.join(directory, "guild-config.json"), "preserve")
    await initializeDataDirectory()

    assert.equal(
      await readFile(path.join(directory, "guild-config.json"), "utf8"),
      "preserve",
    )
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR
    } else {
      process.env.DATA_DIR = previousDataDir
    }

    await rm(directory, { recursive: true, force: true })
  }
})
