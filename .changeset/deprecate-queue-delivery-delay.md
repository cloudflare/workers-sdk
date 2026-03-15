---
"wrangler": patch
"@cloudflare/workers-utils": patch
---

Add deprecation warning for `delivery_delay` in queue producer bindings

The `delivery_delay` setting in `[[queues.producers]]` was silently having no effect since 2024.
This change adds a deprecation warning when the setting is used, informing users that queue-level
settings should be configured using `wrangler queues update` instead. The setting will be removed
in a future version.
