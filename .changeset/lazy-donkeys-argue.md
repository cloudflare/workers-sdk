---
"wrangler": patch
---

Resolve `--latest` to the newest compatibility date supported by the installed runtime

`wrangler deploy --latest` and `wrangler versions upload --latest` resolved the compatibility date to the current date, and `wrangler pages download config` did the same for projects configured to always use the latest compatibility date. Both write that date into a configuration file for subsequent commands to use, so a date that the installed `workerd` did not yet support left the project unable to run `wrangler dev`.

These now resolve to the latest compatibility date supported by this version of Wrangler, which is the release date of the `workerd` it ships with.
