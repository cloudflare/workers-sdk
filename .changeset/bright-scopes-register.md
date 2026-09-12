---
"@cloudflare/workers-auth": minor
---

Accept all production-registered cf OAuth scopes for explicit requests

The cf scope validator now recognizes the full production OAuth registration, including newer scopes such as `dns.read`. The existing default login scope request remains unchanged, so broader permissions are requested only when a caller explicitly supplies them.
