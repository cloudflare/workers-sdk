---
"@cloudflare/workers-auth": patch
---

Fix ctrl+c not being able to interrupt wrangler while waiting for Cloudflare Access authorization

When a domain is behind Cloudflare Access (for example during remote bindings startup), wrangler runs `cloudflared access login`, which only returns once the user completes the authorization flow in the browser. This was invoked synchronously, blocking Node's event loop, so wrangler could not react to ctrl+c (or anything else) until the authorization completed — abandoning the browser flow left a hung wrangler process that had to be killed externally. `cloudflared` is now spawned asynchronously, keeping wrangler responsive while it waits, and a still-pending `cloudflared` process is cleaned up when wrangler exits.
