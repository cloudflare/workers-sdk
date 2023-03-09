---
"wrangler": patch
---

Changed console.debug for logger.debug in Pages uploading. This will ensure the debug logs are only sent when debug logging is enabled with `WRANGLER_LOG=debug`.
