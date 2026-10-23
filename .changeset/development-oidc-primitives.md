---
"miniflare": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Add shared host-side development OIDC session and token-cache primitives, and honor the authentication profile forwarded by `cf dev` in shared development authentication. Native local OIDC issuance still requires the matching workerd callback and Cloudflare development issuance API integrations.
