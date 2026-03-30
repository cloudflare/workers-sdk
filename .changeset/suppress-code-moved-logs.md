---
"@cloudflare/vitest-pool-workers": patch
---

Suppress `CODE_MOVED for unknown code block` log spam from workerd

These are internal workerd diagnostic messages not relevant to application developers. Miniflare's structured log handler already filters them, but `vitest-pool-workers` uses a custom `handleRuntimeStdio` that bypasses that pipeline. This adds the pattern to the pool's own ignore list.
