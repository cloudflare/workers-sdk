---
"wrangler": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
---

Add a Durable Objects hibernation timeout option to Worker deployments

Use `--durable-objects-hibernation-timeout` with deploy and rollback commands to control how long code updates wait for active Durable Objects to hibernate. The default is five minutes; use `0s` to update immediately.
