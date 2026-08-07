---
"wrangler": patch
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Resolve the Workers Assets compatibility flags when building the asset worker config, rather than inside the asset worker

The asset worker used to receive `compatibility_date` and resolve date-gated flags (such as `assets_navigation_prefers_asset_serving`) at request time. Because that worker runs under its own fixed compatibility date, the runtime never expands the user's `compatibility_date` for it, so the resolution has to happen where the config is built. Flag resolution now happens up front during deploy, `wrangler dev`, and the Vite plugin, and the asset worker consumes the already-resolved `compatibility_flags`. This is an internal change with no expected difference in behavior.
