---
"wrangler": patch
---

Adding WRANGLER_DEBUG_ON_ERROR which, if set to 'true' and the application crashes, will retrospectively log to stderr all messages that would have been logged by WRANGLER_LOG=debug
