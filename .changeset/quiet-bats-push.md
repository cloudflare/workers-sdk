---
"wrangler": patch
---

Fix autoconfig failing on `waku` projects that use `hono`

Waku has a tight integration with Hono, causing both to be detected simultaneously and triggering a "multiple frameworks found" error. Hono is now filtered out when Waku is also detected.
