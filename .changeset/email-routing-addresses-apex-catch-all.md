---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Document that `addresses` catch-all entries must use the zone apex

A `*@domain` entry in `addresses` must use the zone apex, such as `*@example.com`. The zone catch-all also receives mail for every subdomain in the zone that has no literal rule.
