---
"@cloudflare/vite-plugin": patch
---

Move imported assets from prerender Workers and child environments into the client output

The client output now includes assets imported by the dedicated prerender Worker and by built child environments of the production entry or prerender Workers.
