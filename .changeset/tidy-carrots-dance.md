---
"wrangler": minor
---

Add telemetry data catalog collection to wrangler deployments

Wrangler now sends anonymized usage data to a telemetry data catalog during `wrangler deploy`. This includes:

- Account ID and Worker name
- Wrangler version and package manager used
- Deployment timestamp
- Binding type counts (how many KV namespaces, R2 buckets, D1 databases, etc.)
- Project dependency information (package names and versions from package.json)

This data helps the Cloudflare team understand Wrangler usage patterns. This telemetry respects the user's existing telemetry settings.
