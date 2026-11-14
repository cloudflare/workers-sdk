---
"@cloudflare/vite-plugin": minor
---

Make `WorkerConfig` the type accepted by auxiliary and prerender Worker `config`

`WorkerConfig` from `@cloudflare/vite-plugin` is now the parsed Worker configuration that auxiliary and prerender Worker `config` accepts and returns, and that their callbacks receive as `entryWorkerConfig`. It previously re-exported the `defineConfig()` Worker type from `@cloudflare/config`, which didn't type-check as an auxiliary Worker `config`. To type a Worker in `cloudflare.config.ts`, import `WorkerConfig` from `cf/config` instead.
