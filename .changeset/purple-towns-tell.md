---
"@cloudflare/vite-plugin": patch
---

Avoid splicing into the middleware stack for Vite versions other than v6

Previously, the plugin spliced its pre-middleware into the Vite middleware stack relative to `viteCachedTransformMiddleware`. In Vite 8, this middleware can be omitted in some scenarios, which would cause the splice to fail. The plugin now registers pre-middleware using `server.middlewares.use()` directly, which places it in the correct position for Vite 7+. For Vite 6, the middleware is moved to the correct position in a post hook.
