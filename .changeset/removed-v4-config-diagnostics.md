---
"@cloudflare/workers-utils": patch
---

Emit explicit removal diagnostics for Wrangler v4 removed `type` and top-level `zone_id` config fields instead of reporting them as unexpected fields with a misleading "Try upgrading Wrangler" hint.
