---
"@cloudflare/containers-shared": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Bypass container image validation when `rollout_kind: none` is set

Setting `rollout_kind: none` for an existing container skips making any changes
to, or rolling out that container. It behaves as a no-op for new containers.
Update the output to more explicitly describe this behavior, and make the image
field optional for existing containers that skip rollouts.
