---
"wrangler": minor
"miniflare": patch
"@cloudflare/workers-utils": minor
---

Add `WRANGLER_CACHE_DIR` environment variable and Yarn PnP auto-detection

Users running Yarn PnP (Plug'n'Play) with zero-installs encounter issues because Wrangler creates cache files in `node_modules` directories that are incompatible with PnP's architecture. This change:

- Adds `WRANGLER_CACHE_DIR` environment variable to override the cache directory (default: `node_modules/.cache/wrangler`)
- Adds `MINIFLARE_CACHE_DIR` environment variable for Miniflare's cf.json cache
- Automatically detects Yarn PnP projects (via `.pnp.cjs` or `.pnp.js`) and uses `.wrangler/cache` instead of `node_modules/.cache/wrangler` and `node_modules/.mf`

For Yarn PnP projects, no configuration is needed - Wrangler will automatically detect the PnP environment and avoid creating files in `node_modules`.

To explicitly override cache locations:

```bash
# Override wrangler's cache directory
WRANGLER_CACHE_DIR=/custom/cache wrangler dev

# Override miniflare's cf.json cache directory
MINIFLARE_CACHE_DIR=/custom/mf wrangler dev
```
