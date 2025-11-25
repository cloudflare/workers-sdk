---
"wrangler": patch
---

Remove the `wrangler deploy`'s `--x-remote-diff-check` experimental flag

The remote diffing feature has been enabled by default for a while and its functionality seems rather stable, as a result the experimental flag (only available for option-out of the feature right now) has been removed.
