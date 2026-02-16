---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add `WRANGLER_CACHE_DIR` environment variable and smart cache directory detection

Wrangler now intelligently detects where to store cache files:

1. Use `WRANGLER_CACHE_DIR` env var if set
2. Use existing cache directory if found (`node_modules/.cache/wrangler` or `.wrangler/cache`)
3. Create cache in `node_modules/.cache/wrangler` if `node_modules` exists
4. Otherwise use `.wrangler/cache`

This improves compatibility with Yarn PnP, pnpm, and other package managers that don't use traditional `node_modules` directories, without requiring any configuration.
