---
"wrangler": patch
---

Improve the log message shown when an asset upload attempt fails and is retried

The retry message now reports which attempt is being made (e.g. `Asset upload failed. Retrying... 1 of 5 attempts.`), making it easier to gauge how close Wrangler is to exhausting its retry budget. The raw error object is no longer appended to this user-facing message; it is instead logged at debug level (visible via `WRANGLER_LOG=debug`).
