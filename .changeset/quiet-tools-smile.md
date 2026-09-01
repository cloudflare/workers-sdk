---
"wrangler": patch
---

Allow Worker operations to complete with granular API tokens

Wrangler now tolerates authorization failures from optional account-level R2, KV, and workers.dev lookups when the token can perform the primary Worker operation. Worker-scoped validation, preview sessions, and trigger updates still run, while unavailable cleanup or display information no longer causes a successful operation to exit with an error.
