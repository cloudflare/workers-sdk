---
"wrangler": minor
---

Include owned Workflow settings in Worker upload metadata for future server-side provisioning

Wrangler now sends an explicit provisioning marker and configured limits, concurrency, schedules, and default retention with owned Workflow exports and bindings. Bindings to another Worker's Workflow remain references only. Wrangler still performs its existing post-deploy Workflow PUT during this staged rollout.
