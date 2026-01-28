---
"wrangler": patch
---

Add `url_encoded=true` query parameter to KV API calls for keys with special characters

KV keys containing special characters like `^` (caret) or `...` were returning 404 errors when using `wrangler kv key get`, `put`, or `delete` commands. This was because while wrangler correctly URL-encoded the key using `encodeURIComponent()`, the Cloudflare API didn't know the key was URL-encoded.

This fix adds the `url_encoded=true` query parameter to all single-key KV API calls (get, put, delete), which tells the API that the key in the URL path is URL-encoded. This matches the existing pattern used by the `secret delete` command.
