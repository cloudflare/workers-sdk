---
"wrangler": patch
---

Allows auto-update of the local Wrangler configuration file to match remote configuration when running `wrangler deploy --env <TARGET_ENV>`

When running `wrangler deploy`, with `--x-remote-diff-check` and after cancelling the deployment due to destructive changes present in the local config file, Wrangler offers to update the Wrangler configuration file to match the remote configuration. This wasn't however enabled when a target environment was specified (via the `--env|-e` flag). Now this will also apply when an environment is targeted.
