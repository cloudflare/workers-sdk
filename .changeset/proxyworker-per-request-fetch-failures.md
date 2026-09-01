---
"wrangler": patch
---

Keep `wrangler dev` running when forwarding a request to the Worker fails

Client disconnects, abandoned requests queued during startup or reload, and failed reads of a `400` response body now return a readable `502 Bad Gateway` response and log the failure at debug level. The development server continues serving subsequent requests. Unexpected errors in the proxy itself remain fatal.
