---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": patch
---

Configure application-wide logs for experimental Durable Object-managed Containers

Set `containers[].observability.enabled` or `containers[].observability.logs.enabled` when using `scheduling_policy: "durable_object"`. Normal deployments create missing applications and update explicitly configured log settings without a Container rollout. Omitted settings preserve the application configuration; root Worker observability is not inherited for this policy.

Version uploads may initialize missing applications but preserve existing settings. Deploying or rolling back Worker versions also preserves existing application settings, and `--containers-rollout=none` skips their updates.
