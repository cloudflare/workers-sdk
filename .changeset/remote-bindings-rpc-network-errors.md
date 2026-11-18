---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Fail remote RPC binding requests on network errors instead of hanging

Remote bindings that connect over RPC treated every network failure, such as being offline, a DNS or TLS error, as a preview reload. The request then waited silently for a reload that never came. These requests now fail with the error, while GET and HEAD requests interrupted by an actual reload are still retried.
