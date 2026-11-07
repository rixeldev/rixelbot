import assert from "node:assert/strict"
import { test } from "node:test"

import ticketSetup from "../commands/ticket-setup.js"
import { installTicketPanel } from "../systems/tickets.js"

test("ticket setup exposes only the intended admin configuration options", () => {
  const command = ticketSetup.data.toJSON()

  assert.equal(command.name, "ticket-setup")
  assert.equal(command.default_member_permissions, "32")
  assert.deepEqual(
    command.options.map((option) => option.name),
    ["category", "support_role", "panel_channel", "transcript_channel"],
  )
})

test("ticket panel installs a single safe open-ticket control", async () => {
  let payload
  const channel = {
    send: async (message) => {
      payload = message
      return { id: "panel-message" }
    },
  }

  await installTicketPanel(channel)

  assert.equal(payload.components.length, 1)
  assert.equal(payload.components[0].components[0].data.custom_id, "ticket:open")
  assert.deepEqual(payload.allowedMentions, { parse: [] })
  assert.match(payload.embeds[0].data.description, /direct message/i)
})
