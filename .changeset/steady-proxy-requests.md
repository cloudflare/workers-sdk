---
"wrangler": patch
---

Show the stack and cause of failed proxied requests in `wrangler dev` debug logs

When a request proxied to the local Worker fails, running with `--log-level debug` now shows the underlying error's stack and cause chain.
