---
"wrangler": patch
---

Fix debugging logs not including headers for CF API requests and responses

Fix the fact that `wrangler`, when run with the `WRANGLER_LOG=DEBUG` and `WRANGLER_LOG_SANITIZE=false` environment variables, displays `{}` instead of the actual headers for requests and responses for CF API fetches
