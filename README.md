# RixelBot

Discord moderation bot that runs as a long-lived web service on Render. Its
HTTP server exposes only `GET /health`; it does not provide an API for bot
commands or data.

## Run locally

Requires Node.js 22.12 or newer.

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` to the bot token.
2. Install dependencies with `npm ci`.
3. Start the bot and health-check server with `npm start`.

The health endpoint listens on `PORT` (default `3000`) and returns `503` until
the Discord client is ready, then `200`. Other paths return `404`.

To register slash commands, set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`,
then run `npm run deploy:commands`. For multiple servers, use `GUILD_IDS` as a
comma-separated list; `GUILD_IDS` takes precedence over `GUILD_ID`.

## Deploy to Render

Create a Blueprint from `render.yaml`. Set `DISCORD_TOKEN` as a secret in
Render; do not commit tokens or paste them into logs. The Blueprint uses a
Starter web service and a 1 GB persistent disk because the bot stores its
configuration, warnings, and temporary voice-channel state as JSON files.
The existing tracked configuration files are copied to the disk on first
startup without replacing files already on the disk.

The persistent disk keeps the service to one instance. Back up `/var/data`
before destructive disk operations. Do not use the ephemeral filesystem for
bot data.

## Ticket system

Enable the **Server Members** and **Message Content** privileged gateway
intents for the bot in the Discord Developer Portal. The bot also requests
Discord's Direct Messages intent to accept support requests privately.
Deploy the slash commands to every server where ticket setup will be used;
use `GUILD_IDS` when registering commands in multiple servers.

Run `/ticket-setup` as a server administrator and select:

- A category for private ticket channels.
- A support role whose members can view and answer tickets.
- A public text channel for the ticket panel.
- A private staff text channel for new-ticket alerts and closed-ticket transcripts.

The bot needs **Manage Channels** server-wide, plus **View Channel**, **Send
Messages**, and **Embed Links** in the panel channel, and **View Channel**,
**Send Messages**, and **Attach Files** in the transcript channel. Keep the
transcript channel private and grant access only to trusted staff.

Members can open a ticket from the panel using the form or by sending the bot a
DM. DMs are routed automatically when the member has one configured server; if
there are several, the bot asks them to choose. DM-created tickets are bridged
between the private channel and the user's DMs. Panel-created tickets are
answered in their private channel. Each member can have one open ticket at a
time across the bot's configured servers. Support staff can claim and close
tickets; closed tickets are moved out of the active category and can be
reopened by staff. Existing tickets keep the category, support role, and
transcript/alert destination they were created with; reconfiguration applies to
newly opened tickets.

Closing a ticket saves a plain-text transcript of up to 1,000 messages or 7 MiB,
whichever comes first, in the configured transcript channel. The transcript
includes message text and attachment links, not copies of attachment files.
Ticket records and transcripts contain potentially sensitive personal
information; set appropriate retention and access policies. Ticket records are
stored in `tickets.json` under `DATA_DIR`, so Render's persistent disk preserves
them across deploys. Pending server selection for a new DM request expires
after 10 minutes and is held in memory, so a service restart clears pending
selections.

## Security notes

- The health endpoint returns only a readiness status; it has no bot controls,
  request body parsing, or sensitive response data.
- Render terminates public HTTPS connections. Keep the service's bot token in
  Render's secret environment variables and rotate it immediately if exposed.
- Invite the bot with only the permissions it needs, keep Discord privileged
  intents limited to features in use, and restrict moderation commands to
  trusted roles.
- Keep dependencies updated and review changes before enabling automatic
  deployment. No service can be guaranteed "unhackable"; security depends on
  the Discord account, token handling, permissions, dependencies, and hosting
  configuration as well as this code.
