---
"wrangler": minor
---

Sanitize sensitive commands in telemetry to prevent accidentally capturing secrets

This change significantly improves telemetry security by:

1. **Renaming telemetry fields**: `command` → `safe_command` and `args` → `safe_args` to distinguish from historical data that may have contained sensitive information.

2. **Removing "wrangler" prefix**: The `safe_command` field no longer includes the "wrangler" prefix (e.g., `secret put` instead of `wrangler secret put`) for future-proofing.

3. **Inverting the default**: Commands now default to `sensitiveArgs: true` (sensitive), meaning arguments are stripped from telemetry unless a command explicitly opts in with `sensitiveArgs: false`.

4. **Truncating command strings**: When `sensitiveArgs` is true, the command string is truncated to just the command prefix (e.g., `secret put` instead of `secret put MY_KEY accidentally_pasted_secret`).

5. **Auditing all commands**: Each command has been reviewed and explicitly marked as safe or sensitive based on whether its arguments could contain secrets.

Commands marked as **sensitive** (args stripped):

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
