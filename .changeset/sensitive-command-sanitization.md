---
"wrangler": patch
---

Sanitize sensitive commands in telemetry to prevent accidentally capturing secrets

Commands like `wrangler secret put` and `wrangler login` now have their arguments stripped from telemetry data. This prevents accidentally capturing secrets or credentials that users may have pasted as command arguments.

This is implemented via a new `sensitiveArgs` metadata property on command definitions. When a command has `sensitiveArgs: true`, the telemetry system will strip argument values to prevent sensitive data from being captured.

Affected commands:

- `wrangler login`
- `wrangler secret put`
- `wrangler secret bulk`
- `wrangler pages secret put`
- `wrangler pages secret bulk`
- `wrangler versions secret put`
- `wrangler versions secret bulk`
