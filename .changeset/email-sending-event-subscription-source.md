---
"wrangler": minor
---

Add `email.sending` as an event subscription source for queues

`wrangler queues subscription create` now accepts `--source email.sending` alongside two new flags, `--zone-id` and `--domain`, which identify the zone and the sending domain (zone apex or a verified subdomain) to subscribe to. Both flags are required for this source. The subscription's resource is displayed as the sending domain in `wrangler queues subscription get`.
