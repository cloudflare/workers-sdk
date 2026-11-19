---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Fix remote bindings authentication with API tokens scoped to an individual Worker

Remote bindings now create preview sessions through the Worker-scoped endpoint. When the response includes a usable exchange URL, its hostname is used without account-wide Workers subdomain access; otherwise, the existing account subdomain lookup or registration is used. This applies to `getPlatformProxy` and remote bindings in Wrangler, the Cloudflare Vite plugin, and the Vitest integration. Tokens still need permission to update the named Worker.
