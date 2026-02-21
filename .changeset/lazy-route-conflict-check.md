---
"wrangler": patch
---

Avoid unnecessary route conflict lookups during deploy

When deploying with routes, Wrangler now only queries the Zones API to diagnose route conflicts after the bulk routes update fails, instead of doing so on successful deploys. This can reduce deploy latency and API traffic while still surfacing a clear error when a route is already assigned to a different worker.
