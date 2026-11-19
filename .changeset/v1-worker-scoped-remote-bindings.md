---
"@cloudflare/vite-plugin": patch
---

Fix remote bindings authentication with API tokens scoped to an individual Worker

Remote bindings now create preview sessions through the Worker-scoped endpoint. When the response includes a usable exchange URL, its hostname is used without account-wide Workers subdomain access; otherwise, the existing account subdomain lookup or registration is used. This applies to remote bindings in the Cloudflare Vite plugin. Tokens still need permission to update the named Worker.
