---
"@cloudflare/vitest-pool-workers": patch
---

Use miniflare's `handleStructuredLogs` option instead of `handleRuntimeStdio` for processing workerd output

Previously, `vitest-pool-workers` manually processed raw stdout/stderr streams from the workerd runtime via `handleRuntimeStdio`, with its own filtering of known noisy messages (e.g. LLVM symbolizer warnings). This switches to miniflare's `handleStructuredLogs` option, which parses workerd's structured JSON log output and automatically filters known unhelpful messages. This aligns with how both `wrangler` and `vite-plugin-cloudflare` handle workerd logs.
