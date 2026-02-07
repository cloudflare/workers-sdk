---
"wrangler": minor
"miniflare": patch
"@cloudflare/workers-utils": minor
---

Add `WRANGLER_HOME` and `WRANGLER_CACHE_DIR` environment variables for configurable temp directories

Users running Yarn PnP (Plug'n'Play) with zero-installs encounter issues because Wrangler creates temporary/cache files in `node_modules` directories that are incompatible with PnP's architecture. This change:

- Adds `WRANGLER_HOME` environment variable to override the default `.wrangler` directory location
- Adds `WRANGLER_CACHE_DIR` environment variable to override the cache directory (default: `node_modules/.cache/wrangler`)
- Automatically detects Yarn PnP projects (via `.pnp.cjs` or `.pnp.js`) and uses `.wrangler/cache` instead of `node_modules/.cache/wrangler`
- Updates Miniflare to respect these environment variables for its `cf.json` cache file

To use these features:

```bash
# Override the .wrangler directory location
WRANGLER_HOME=/custom/path wrangler dev

# Override just the cache directory
WRANGLER_CACHE_DIR=/custom/cache wrangler dev
```

For Yarn PnP projects, no configuration is needed - Wrangler will automatically detect the PnP environment and avoid creating files in `node_modules`.
