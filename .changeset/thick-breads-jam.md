---
"@cloudflare/vite-plugin": patch
---

Exclude Cloudflare built-ins from client dependency optimization.
Some frameworks allow users to mix client and server code in the same file and then extract the server code.
As the dependency optimization may happen before the server code is extracted, we now exclude Cloudflare built-ins from client optimization.
