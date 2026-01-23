---
"wrangler": patch
---

Sanitize commands in telemetry to prevent accidentally capturing sensitive information that users may have mistakenly pasted as command arguments.

The following commands will no longer collect any telemetry on argument usage:

- All secret commands: `wrangler secret put/bulk`, `wrangler pages secret put/bulk`, `wrangler versions secret put/bulk`
- `wrangler login`
- `wrangler kv key put`, `wrangler kv bulk put`
- `wrangler hyperdrive create/update`
- `wrangler r2 bucket sippy enable`
- `wrangler d1 execute`
- `wrangler secrets-store secret create/update`
- `wrangler workflows trigger`, `wrangler workflows instances send-event`
- Generally commands with file paths that could reveal sensitive structure
- Any command not explicitly marked as safe
