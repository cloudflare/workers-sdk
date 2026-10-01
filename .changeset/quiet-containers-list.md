---
"wrangler": patch
---

Fix `wrangler containers list` to report live instances

The `LIVE INSTANCES` column now reports each application's active runtime instances instead of its configured instance count, matching the Cloudflare dashboard. JSON output continues to expose the configured count through the existing `instances` field.
