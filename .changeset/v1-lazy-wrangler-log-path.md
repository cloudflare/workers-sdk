---
"@cloudflare/vite-plugin": patch
---

Respect `WRANGLER_LOG_PATH` set after importing the plugin in `vite.config.ts`

Require Wrangler 4.168.0 or newer, which resolves the debug log path on first use. A path set in the Vite configuration body now selects the configured log file.
