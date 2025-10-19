---
"wrangler": patch
---

Potentially update local config on `wrangler deploy --x-remote-diff-check` invocations

The changes here update `wrangler deploy`, when run with `--x-remote-diff-check`, to offer the user the possibility to update the local configuration file in case there were conflicts with the remote configuration (and the user has decided not to override the remote configuration with the local one)
