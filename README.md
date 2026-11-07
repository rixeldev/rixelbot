# Rixelbot

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
then run `npm run deploy:commands`.

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
