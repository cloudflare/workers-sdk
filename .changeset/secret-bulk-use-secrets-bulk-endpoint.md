---
"wrangler": patch
---

Use dedicated `secrets-bulk` API endpoint for `wrangler secret bulk`

Previously, `wrangler secret bulk` used a workaround that fetched all script settings and re-patched the full bindings array (including non-secret bindings) via the `/settings` endpoint. This has been replaced with a single PATCH request to the new `/secrets-bulk` endpoint using JSON Merge Patch (RFC 7396). This reduces the operation from 2 API calls to 1 and eliminates the risk of accidentally affecting non-secret bindings.
