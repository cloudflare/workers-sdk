---
"miniflare": patch
"wrangler": patch
---

Fix AI Search binding failing in local dev

Using AI Search bindings with `wrangler dev` would fail with "RPC stub points at a non-serializable type". AI Search bindings now work correctly in local development.
