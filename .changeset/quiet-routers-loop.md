---
"@cloudflare/workers-shared": patch
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Improve routing performance for Workers with assets

Reduce request handling latency by streamlining the router Worker's request path. The loopback infrastructure remains available for future use.
