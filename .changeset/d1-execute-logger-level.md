---
"wrangler": patch
---

Restore the D1 `executeSql` logger level via try/finally

`wrangler d1 execute --json` and the internal `executeSql` helper temporarily lower the global logger to `"error"` to keep human-readable output out of the JSON payload. Previously the level was restored only on the happy path, so any early return or thrown error left the singleton logger muted, silencing later `logger.warn`/`logger.log` output (notably from migration helpers that wrap `executeSql` and are commonly mocked in tests).

The level swap is now wrapped in `try`/`finally` so it is always restored.
