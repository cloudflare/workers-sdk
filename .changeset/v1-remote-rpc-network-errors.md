---
"@cloudflare/vite-plugin": patch
---

Fail remote RPC binding requests on network errors instead of hanging

Remote bindings that connect over RPC treated network failures as preview reloads and waited silently for a reload. These requests now fail with the error, while GET and HEAD requests interrupted by a preview reload are retried against the replacement preview.
