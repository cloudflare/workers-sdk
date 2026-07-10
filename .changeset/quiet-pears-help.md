---
"@cloudflare/vite-plugin": minor
---

Support auxiliary Workers with `experimental.newConfig`

Point each `auxiliaryWorkers[].configPath` at that Worker's TypeScript config to launch multiple Workers from one Vite development or build command. Existing Wrangler config paths continue to work when `experimental.newConfig` is disabled.
