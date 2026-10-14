---
"miniflare": patch
---

Align local D1 query metadata with production D1

Local D1 queries now report `served_by_primary: true`, `total_attempts: 1`, and `timings.sql_duration_ms` through both HTTP and RPC bindings. `duration` measures SQL execution rather than result conversion and metadata bookkeeping. Region and colo fields remain absent because local databases do not run in a Cloudflare colo.
