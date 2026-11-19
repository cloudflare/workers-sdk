---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Fix remote bindings authentication with API tokens scoped to an individual Worker

Remote bindings now create preview sessions through the Worker-scoped endpoint and derive the preview hostname from the session response, avoiding account-wide Workers subdomain access. This applies to `getPlatformProxy` and remote bindings in Wrangler, the Cloudflare Vite plugin, and the Vitest integration. Tokens still need permission to update the named Worker.
