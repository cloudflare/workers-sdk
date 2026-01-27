---
"wrangler": patch
---

Emit autoconfig summary as a separate output entry

Move the autoconfig summary from the `deploy` output entry to a dedicated `autoconfig` output entry type. This entry is now emitted by both `wrangler deploy` and `wrangler setup` commands when autoconfig runs, making it easier to track autoconfig results independently of deployments.
