---
"wrangler": minor
---

Add traces, OTEL destinations, and configurable persistence to observability settings

Adds a new `traces` field to the `observability` settings in your Worker configuration that configures the behavior of automatic tracing. Both `traces` and `logs` support providing a list of OpenTelemetry compliant `destinations` where your logs/traces will be exported to as well as an implicitly-enabled `persist` option that controls whether or not logs/traces are persisted to the Cloudflare observability platform and viewable in the Cloudflare dashboard.
