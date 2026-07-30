---
"@cloudflare/vitest-pool-workers": patch
---

Preserve the deprecated Miniflare `cache` option

Vitest configurations using `cache` continue to work after the internal Miniflare v5 upgrade. The option is translated to `cacheAPI`; new configurations should use `cacheAPI` directly.
