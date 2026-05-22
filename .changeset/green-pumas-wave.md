---
"wrangler": minor
---

Add `containers[].observability` support to `wrangler deploy`

Wrangler now accepts container-specific observability settings via `containers[].observability`, including application-level targeting fields for Containers. Root `observability` continues to work as a fallback when a container does not define its own observability settings.

`wrangler deploy` now preserves legacy `configuration.observability` for existing container apps that still use rollout-based observability, while using top-level application observability for new or already-migrated apps.
