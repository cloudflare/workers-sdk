---
"miniflare": patch
---

Clean up local Containers during managed shutdown

Miniflare now gives Container-enabled workerd processes up to five seconds to remove application containers, networking sidecars, and snapshot volumes before forcing shutdown.
