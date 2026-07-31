# TeamMarySy Bot

> **See [BLUEPRINT.md](./BLUEPRINT.md)** for a full, script-generated index of every function, command, callback, and cron job in this codebase, with source line numbers and verification instructions.

Telegram bot running on Cloudflare Workers, backed by Workers KV, implementing
role-based access control (General / Admin / Owner) per the TeamMarySy
Deployment Roadmap.

## 1. Setup

```bash
npm install
```

### Create the KV namespace

```bash
npx wrangler kv namespace create "TEAMMARYSY_KV"
npx wrangler kv namespace create "TEAMMARYSY_KV" --preview
```

Copy the returned `id` and `preview_id` into `wrangler.toml`.

### Set secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN     # from @BotFather
npx wrangler secret put WEBHOOK_SECRET         # any random string you choose
npx wrangler secret put OWNER_TELEGRAM_ID      # your numeric Telegram user ID
```

## 2. Deploy

```bash
npx wrangler deploy
```

Note the deployed URL, e.g. `https://teammarysy-bot.<subdomain>.workers.dev`.

## 3. Register the Telegram webhook

```bash
node scripts/set-webhook.mjs https://teammarysy-bot.<subdomain>.workers.dev <BOT_TOKEN> <WEBHOOK_SECRET>
```

Use the **same** `WEBHOOK_SECRET` value you set as a Worker secret.

## 4. Verify

- Send `/start` to your bot in Telegram — you should get the welcome message.
- Send `/help` — command list should reflect your role (Owner sees all tiers).
- `npx wrangler tail` — watch live logs while testing.

## Project Structure

```
src/
  index.ts              Worker entry point (fetch + scheduled)
  router.ts             Central update router (auth -> validate -> authorize -> dispatch -> audit)
  lib/
    types.ts             Env bindings, roles, Telegram + KV record types
    telegram.ts           Telegram Bot API client wrapper
    kv.ts                 Workers KV data access layer
  middleware/
    auth.ts               Identifies user/chat, upserts user record
    rbac.ts                Permission map + authorization checks
    validation.ts          Structural validation, arg/callback parsing
    audit.ts               Writes audit log entries to KV
  handlers/
    general.ts             /start /help /announcements /events /ticket + callbacks
    admin.ts                /announce /createevent /createsurvey /schedules /tickets
    owner.ts                /setrole /logs /report /broadcast
  scheduled/
    jobs.ts                 Cron job implementations (reminders, refresh, cleanup)
scripts/
  set-webhook.mjs          One-off CLI helper to register the webhook
wrangler.toml              Worker config, KV binding, cron schedule
```

## Roles & Permissions

| Tier    | Can do |
|---------|--------|
| General | `/start`, `/help`, `/announcements`, `/info`, `/faq`, `/events` (alias `/event`), `/survey <id>`, `/docs [category]`, `/status`, `/ticket <subject>` (alias `/submit`), join events, vote in surveys, browse FAQ/docs via inline buttons |
| Admin   | Everything General can, plus `/announce`, `/createevent` (with optional capacity), `/event cancel <id>`, `/createsurvey`, `/closesurvey`, `/schedules` (alias `/schedule`, toggle active/inactive via button), `/createschedule`, `/tickets` (resolve via button), `/resolve <id> \| notes`, `/adddoc Title \| content \| category` (delete via button), `/addfaq Question \| Answer` |
| Owner   | Everything Admin can, plus `/setrole`, `/roles` (staff directory + role changes), `/permissions` (view the full command permission matrix), `/config get/set <key>`, `/logs`, `/report`, `/broadcast`; overrides all permission checks |

The single source of truth for this mapping is `src/middleware/rbac.ts`
(`COMMAND_PERMISSIONS` / `CALLBACK_PREFIX_PERMISSIONS`).

The account matching the `OWNER_TELEGRAM_ID` secret always resolves to the
`owner` role, even before it has an existing KV user record.

## KV Key Schema

| Key pattern              | Contents |
|---------------------------|----------|
| `user:{userId}`           | `UserRecord` — role, join date, block status |
| `config:{key}`            | Arbitrary JSON runtime configuration |
| `announcement:{id}`       | `AnnouncementRecord` |
| `event:{id}`              | `EventRecord` — includes optional `capacity`; joins beyond capacity are rejected |
| `survey:{id}`             | `SurveyRecord` (with votes) |
| `schedule:{id}`           | `ScheduleRecord` — `active` toggled via inline button or `/createschedule` |
| `ticket:{id}`             | `TicketRecord` (includes `resolvedBy`/`resolution`/`resolvedAt` once closed via `/resolve` or the "Mark resolved" button) |
| `doc:{id}`                | `DocumentRecord` — shared docs, optionally tagged with a `category` |
| `faq:{id}`                | `FaqRecord` — question/answer pairs browsed via `/faq` |
| `log:{yyyy-mm-dd}:{ulid}` | `LogRecord` — audit trail, partitioned by day |
| `counter:{name}`          | Plain numeric counters |

## Scheduled Tasks

Configured in `wrangler.toml` under `[triggers]` and dispatched in
`src/scheduled/jobs.ts`:

- `*/30 * * * *` — event reminders to attendees starting within the hour
- `0 */4 * * *` — refresh externally-sourced data (placeholder, extend as needed)
- `0 3 * * *` — purge audit log entries older than 30 days
- `0 9 * * 1` — weekly maintenance summary (open tickets, active schedules, doc count) sent to the Owner

## Extending

- **New command:** add a handler function in the matching `handlers/*.ts`
  file, register it in `COMMAND_PERMISSIONS` (`rbac.ts`) with its minimum
  role, then wire it into `COMMAND_HANDLERS` in `router.ts`.
- **New callback action:** namespace `callback_data` as `gen:action:...`,
  `admin:action:...`, or `owner:action:...`, add the handler to
  `CALLBACK_HANDLERS` in `router.ts`.
- **New KV entity:** add its type to `lib/types.ts` and CRUD helpers to
  `lib/kv.ts` following the existing key-prefix pattern.

## Configuration updates without redeploying

Anything read via `getConfig` / stored via `setConfig` in `lib/kv.ts` lives in
Workers KV and can be changed by adding an admin command that calls
`setConfig`, without touching source code or redeploying the Worker — in line
with the roadmap's configuration-management goals.
