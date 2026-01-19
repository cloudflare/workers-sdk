---
"wrangler": minor
---

Sanitize sensitive commands in telemetry to prevent accidentally capturing secrets

This change significantly improves telemetry security by:

This prevents accidentally capturing secrets or credentials that users may have pasted as command arguments.

The following commands will no longer collect any telemetry on argument usage:

- All secret commands: `wrangler secret put/bulk`, `wrangler pages secret put/bulk`, `wrangler versions secret put/bulk`
- `wrangler login`
- `wrangler kv key put`, `wrangler kv bulk put`
- `wrangler hyperdrive create/update` (contains connection strings/passwords)
- `wrangler r2 bucket sippy enable` (contains AWS/GCS credentials)
- `wrangler d1 execute` (SQL could contain secrets)
- `wrangler secrets-store secret create/update`
- `wrangler workflows trigger`, `wrangler workflows instances send-event`
- Commands with file paths that could reveal sensitive structure
- Any command not explicitly marked as safe

Commands marked as **safe** (args included):

- Read-only/list commands (e.g., `wrangler d1 list`, `wrangler kv key list`)
- Info commands (e.g., `wrangler whoami`, `wrangler d1 info`)
- Commands with only non-sensitive arguments (resource IDs, names from config)
