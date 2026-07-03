---
"@cloudflare/vite-plugin": patch
---

Source remote bindings directly from `@cloudflare/remote-bindings` instead of going through `wrangler`.

This removes the plugin's reliance on `wrangler` for establishing remote binding proxy sessions and enables environment-variable-driven auth discovery, so remote bindings keep working (and refresh their OAuth token) when the plugin is driven by a top-level CLI.
