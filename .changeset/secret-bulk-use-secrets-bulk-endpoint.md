---
"wrangler": patch
---

Use dedicated API endpoint for `wrangler secret bulk`

`wrangler secret bulk` now uses a more efficient, dedicated API endpoint. This reduces the operation from 2 API calls to 1 and eliminates the risk of accidentally affecting non-secret bindings.
