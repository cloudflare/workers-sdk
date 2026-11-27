---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Emit explicit removal warnings for removed `type` and `zone_id` configuration fields

Legacy Wrangler v3 `type` and `zone_id` fields now emit explicit removal warnings with migration guidance instead of being flagged as unexpected fields with a misleading "Try upgrading Wrangler" hint.
