---
"@cloudflare/vite-plugin": patch
---

Expose `canBeForwarded` when testing email handlers locally

Update Miniflare to 5.20261117.0-beta so incoming email messages delivered through the Vite development server expose `canBeForwarded: true`, matching production. Align Wrangler and the shared compatibility-date helpers with the November 17 runtime and Workers types.
