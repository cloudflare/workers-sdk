---
"@cloudflare/workers-auth": patch
---

Fix `cf auth login` requesting unsupported email read scopes

The Cloudflare OAuth server does not define `email_routing:read` or `email_sending:read`. The `cf` CLI now requests only the registered write scopes for those products, preventing login from failing with an unknown OAuth scope error.
