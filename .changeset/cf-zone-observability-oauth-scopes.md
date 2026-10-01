---
"@cloudflare/workers-auth": minor
---

Allow cf to request the zone observability OAuth scopes

New cf OAuth logins request `zone-observability.read` and `zone-observability.write`. Existing sessions must authenticate again to receive them.
