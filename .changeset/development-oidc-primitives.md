---
"miniflare": minor
"@cloudflare/workers-auth": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Add shared host-side development OIDC session and bounded issuance primitives, and honor the authentication profile forwarded by `cf dev` in shared development authentication. Native local OIDC issuance still requires the matching workerd callback and Cloudflare development issuance API integrations.

Bound host request lifetimes, pending callers, and UTF-8 response data. Invalidation rejects callers promptly, including when a transport ignores abort, while retaining concurrency accounting for unfinished operations. Snapshot credentials and session metadata, and use the selected OAuth credential for account discovery.
