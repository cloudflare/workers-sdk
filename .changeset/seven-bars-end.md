---
"wrangler": minor
---

Add traces and OTEL destinations to observability settings

Adds a new `traces` field to the `observability` settings in your Worker configuration that configures the behavior of automatic tracing. Both `traces` and `logs` support providing a list of OpenTelemetry compliant destinations where your logs/traces will be exported to.
