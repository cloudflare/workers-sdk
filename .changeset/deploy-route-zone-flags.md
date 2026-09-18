---
"wrangler": minor
---

Add `--zone` and `--zone-id` flags to `wrangler deploy` and `wrangler triggers deploy` to attach a zone to routes passed via `--route`

Routes passed on the command line were always sent to the Cloudflare API as bare patterns. Zones with an SSL for SaaS entitlement reject such routes with error 10082 ("When using wildcard host ssl for saas entitlement you must specify the zone per route using zone_id or zone_name"), and until now the only way to set a zone was in the config file, which `--route` overrides.

Pass a single zone to apply it to all routes, or one zone per route in the same order as the `--route` flags:

`wrangler deploy --route "app.example.com/*" --route "api.example.com/*" --zone example.com`

`wrangler deploy --route "a.example.com/*" --zone example.com --route "b.example.net/*" --zone example.net`

`--zone` sets `zone_name` and `--zone-id` sets `zone_id` on each route. The two flags cannot be combined, and passing more than one zone requires exactly one per `--route`. Routes without zone flags behave exactly as before.
