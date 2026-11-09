---
"@cloudflare/edge-preview-authenticated-proxy": patch
---

Restrict the `/.update-preview-token` redirect to same-origin paths

Previously, the `suffix` query parameter was copied into the `Location` header unchanged, so the endpoint could redirect the browser to any other site (for example `https://…`, `//…` or `/\…`). The `suffix` is now resolved against the request URL, and anything that would leave the current origin falls back to `/`.
