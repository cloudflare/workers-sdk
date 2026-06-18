---
"@cloudflare/deploy-helpers": patch
---

Move resource provisioning into deploy helpers

Worker deploy and versions upload now share the deploy helpers implementation for provisioning bindings, reducing Wrangler-specific callback wiring while preserving existing behavior.
