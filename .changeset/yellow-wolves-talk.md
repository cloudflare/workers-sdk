---
"wrangler": minor
---

fix: minor improvements to R2 notification subcommand

1. `r2 bucket event-notification <subcommand>` becomes `r2 bucket notification <subcommand>`
2. Parameters to `--event-type` use `-` instead of `_` (e.g. `object_create` -> `object-create`)

Since the original command was not yet operational, this update does not constitute a breaking change.
