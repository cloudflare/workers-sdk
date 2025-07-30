---
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

fix: move local dev container cleanup to process exit hook. this should hopefully clean up containers in more scenarios.
