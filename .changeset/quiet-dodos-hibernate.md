---
"wrangler": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
---

Add Durable Objects code update strategies to Worker deployments

Use `--durable-objects-code-update-mode immediate` with `wrangler deploy`, `wrangler versions deploy`, and `wrangler rollback` to update code without waiting for active instances to hibernate. Use `--durable-objects-code-update-mode deferred 30s` to set a maximum delay, or configure `durable_objects.code_update_strategy` with `mode` and `max_delay`. When unset, the strategy defaults to deferred with a 5-minute maximum delay; delays cannot exceed 24 hours and must use millisecond precision.
