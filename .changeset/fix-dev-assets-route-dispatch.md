---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Fix `wrangler dev` asset fallback with custom routes

`wrangler dev` now applies Workers Assets fallback behavior consistently when routes are configured, including SPA fallback and `404-page` handling.
