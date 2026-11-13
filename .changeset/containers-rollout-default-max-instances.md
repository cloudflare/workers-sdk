---
"wrangler": patch
---

Use the effective `max_instances` value when choosing the default container rollout steps

When `max_instances` was omitted, Wrangler deployed 20 instances but chose rollout steps as if there were 0 instances, so the rollout used a single 100% step. Wrangler now uses `[10, 100]` for omitted `max_instances`, while still using a single 100% step when `max_instances` is 0 or 1.
