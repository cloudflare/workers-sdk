---
"wrangler": patch
---

Fix `wrangler dev` remote bindings for `workers.dev` subdomains protected by Access

Running `wrangler dev` with remote bindings on an unpublished worker protected by Access (e.g. using a wildcard on your workers.dev domain) previously failed with a redirect loop. Wrangler now correctly authenticates remote bindings with Access in this situation.
