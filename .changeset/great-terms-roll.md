---
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

fix: move local dev container cleanup to process exit hook. This should ensure containers are cleaned up even when Wrangler is shut down programatically.
