---
"wrangler": patch
---

fix: register middleware once for module workers

Ensure middleware is only registered on the first request when using module workers.
This should prevent stack overflows and slowdowns when making large number of requests to `wrangler dev` with infrequent reloads.
