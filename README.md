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

Run `/backup` in a server to download an ephemeral JSON attachment containing
that server's bot configuration, warning history, ticket records, and temporary
voice-channel state. The command requires **Manage Server** and has an 8 MiB
download limit. Backups include private ticket metadata and moderation records;
store downloaded files securely. This export does not include credentials or
ticket conversation transcripts, and is not a substitute for backing up the
Render persistent disk.

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

## Spam and raid protection

Run `/guard-setup` as a server administrator to choose a private alert channel,
turn message spam protection, join-raid alerts, and invite filtering on or off,
and set thresholds. Optional thresholds retain their previous value when
omitted; `clear_exemptions` removes the configured bypass role and ignored
channel. The initial thresholds are 6 messages in 8 seconds, 5 mentions in one
message, 8 joins in 10 seconds, and 3 identical messages.
Moderators with **Manage Messages**, the configured bypass role, and the
configured ignored channel are exempt from message filtering.

The recommended `delete_alert` spam action removes the message that trips the
threshold and alerts staff. `alert_only` does not delete or sanction messages.
`delete_timeout` additionally applies a 5-minute timeout on the second spam
detection within 10 minutes; it needs the **Moderate Members** permission.
Discord invite links are deleted from non-exempt members when the invite filter
is enabled. Raid detection only alerts staff and never automatically restricts
new members. Alerts are rate-limited to reduce channel flooding.

The bot needs **Manage Messages** to delete spam/invites, **Send Messages** in
the alert channel, and **Moderate Members** only when using `delete_timeout`.
This feature does not automatically ban, kick, or lock the server. Review the
alert channel and tune thresholds to the server's normal traffic.

## Automatic member role

Run `/autorole-setup role:<role>` as a server administrator to assign one basic
role when a human member joins. Omitting the role option disables the feature.
For safety, the selected role cannot be `@everyone`, integration-managed, or
grant administrative, moderation, or server-management permissions. The bot
needs **Manage Roles**, and its highest role must be above the selected role.
Configure a low-privilege member role; bot accounts are not assigned this role.

## Reaction role panel

Run `/role-panel` to post an embed with up to 10 emoji-to-role choices. By
default, members can react to add multiple roles and remove a role by removing
their reaction. Set `selection_mode` to **One role at a time** to make choices
exclusive within that panel: choosing another option removes the previous
selection from that panel. Roles selected in other panels are unaffected. Only
roles with no Discord permissions are accepted, and they must be below roles
that have permissions. Use `/role-panel-remove message_id:<id>` to disable a
panel; its message can then be deleted manually.

The bot needs **View Channel**, **Send Messages**, **Embed Links**, **Add
Reactions**, and **Read Message History** in the panel channel. Enable the
**Server Members** privileged intent in the Developer Portal, as well as the
`Guild Message Reactions` intent requested by the bot. Keep cosmetic roles
below staff roles and do not give them channel-specific permission overrides;
those overrides can grant access even when the role itself has no permissions.

## Welcome and departure messages

Run `/welcome-setup` as a server administrator with a welcome or leave channel
to enable the corresponding message. Customize each message with `{member}`,
`{server}`, and `{count}`; messages do not ping anyone. You can update an
existing message without changing its channel, or disable either message with
`disable_welcome` or `disable_leave`. The bot needs **View Channel** and **Send
Messages** in each configured channel. Bot accounts do not trigger these
messages.

## Warning management

Moderators with **Moderate Members** can issue warnings with `/warn`, review a
member's history with `/warnings`, and revoke a specific warning with
`/clearwarn user:<member> warning_id:<id>`. Revocation preserves the original
warning and records who revoked it, when, and why; the warning history labels
revoked entries, and the moderation log records the action when `/setlogs` is
configured. Supply a reason when revoking a warning for a clearer audit trail.

## Ban management

Moderators with **Ban Members** can ban members using `/ban` and remove an
existing ban by user ID with `/unban user_id:<id>`. The unban command verifies
that the ID is valid and currently banned before changing server state. Both
slash and prefix forms record the action in the configured moderation log.

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
