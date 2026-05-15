---
"miniflare": patch
"wrangler": patch
---

Fix local Workflow startup when compatibility flags include `experimental`

Miniflare now deduplicates compatibility flags for the internal Workflow engine service. This prevents `wrangler dev` from failing with `Compatibility flag specified multiple times: experimental` when the user's Worker already enables that flag.
