---
"miniflare": patch
---

Add `MINIFLARE_CACHE_DIR` environment variable and smart cache directory detection

Miniflare now intelligently detects where to store its cf.json cache file:

1. Use `MINIFLARE_CACHE_DIR` env var if set
2. Use existing cache directory if found (`node_modules/.mf` or `.wrangler/cache`)
3. Create cache in `node_modules/.mf` if `node_modules` exists
4. Otherwise use `.wrangler/cache`

This improves compatibility with Yarn PnP, pnpm, and other package managers that don't use traditional `node_modules` directories, without requiring any configuration.
