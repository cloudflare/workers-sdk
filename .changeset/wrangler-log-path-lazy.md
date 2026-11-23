---
"wrangler": patch
---

Fix `WRANGLER_LOG_PATH` being ignored when set in `vite.config.ts` after a static import of `@cloudflare/vite-plugin`

The debug log filepath is now resolved lazily on first write (memoized), matching how `WRANGLER_WRITE_LOGS` is read. Setting `process.env.WRANGLER_LOG_PATH` in the Vite config body after importing the plugin now writes logs to the configured path instead of the global default directory.
