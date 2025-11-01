---
"wrangler": patch
---

Offer to update the local Wrangler configuration file to match remote configuration when running `wrangler deploy`

When running `wrangler deploy`, with `--x-remote-diff-check`, Wrangler will display the difference between local and remote configuration.
If there would be a destructive change to the remote configuration, the user is given the option to cancel the deployment.
In the case where the user does cancel deployment, Wrangler will now also offer to update the local Wrangler configuration file to match the remote configuration.
