---
"@cloudflare/vite-plugin": patch
---

Simplify `/cdn-cgi/` handling

We now only add special handling for `/cdn-cgi/handler/*` routes, so that trigger handlers are invoked on the User Worker.
