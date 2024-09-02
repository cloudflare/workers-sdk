---
"wrangler": patch
---

chore: avoid potential double-install of create-cloudflare

When `wrangler init` delegates to C3, it did so via `npm create cloudflare@2.5.0`. C3's v2.5.0 was the first to include auto-update support to avoid `npx`'s potentially stale cache. But this also guaranteed a double install for users who do not have 2.5.0 cached. Now, wrangler delegates via `npm create cloudflare@^2.5.0` which should use the latest version cached on the user's system or install and use the latest v2.x.x.
