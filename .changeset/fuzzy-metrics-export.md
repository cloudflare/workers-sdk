---
"wrangler": minor
---

Add `observability.metrics` deploy configuration for Workers metrics export

Wrangler now validates metrics export destinations and reconciles the configured Worker self-resource after deploy. Setting `observability.metrics.enabled` to `false` removes this Worker's metrics export requester resources.
