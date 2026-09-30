---
"@cloudflare/workers-auth": minor
---

Allow cf to request the K2 OAuth scopes

New cf OAuth logins request `k2.consume`, `k2.produce`, `k2.read`, and `k2.write`, which are registered for the cf OAuth client. Existing sessions must authenticate again to receive them.
