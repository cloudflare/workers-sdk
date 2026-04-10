---
"wrangler": patch
---

Keep proxy notices off stdout for JSON Wrangler commands

Wrangler now writes the startup notice for `HTTP_PROXY` and `HTTPS_PROXY` to stderr instead of stdout. This keeps commands like `wrangler auth token --json` machine-readable when a proxy is configured.
