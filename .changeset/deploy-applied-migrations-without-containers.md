---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fix `wrangler deploy` and `wrangler versions upload` rejecting an already-applied Durable Object migration history

Both commands replayed the Worker's whole `migrations` history locally before uploading, even when no Durable Object-managed Containers were configured. A history in which a later tag deletes or renames a class that no earlier tag in the file creates failed with an error such as "Cannot apply deleted_classes migration to non-existent class", although Wrangler only uploads the steps after the Worker's current migration tag. The replay now runs only when Durable Object-managed Containers are configured. For other Containers, `wrangler deploy` now replays the history only when no Durable Object binding names the container's class.
