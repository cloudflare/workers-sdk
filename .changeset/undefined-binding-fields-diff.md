---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Don't report unchanged bindings as changed when deploying a Worker last edited in the Dashboard

The remote config that Wrangler compares with the local one sets optional binding fields that aren't set, such as a Durable Object's `script_name` and `environment` or an R2 bucket's `jurisdiction`, to `undefined`. The comparison counted those fields as deleted, so `wrangler deploy` warned that the remote configuration would be overridden even though the bindings were unchanged, and with `--strict` in a non-interactive environment it aborted the deployment. These fields are now treated the same as missing ones.
