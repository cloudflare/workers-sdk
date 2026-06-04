---
"wrangler": patch
---

Handle API validation errors from `wrangler containers ssh`

Wrangler now lets the Containers API validate SSH instance IDs and preserves raw API error bodies such as `INVALID_INSTANCE_ID` when reporting validation failures.
