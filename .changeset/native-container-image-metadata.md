---
"wrangler": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
---

Remove the experimental Container image environment binding

Durable Object-managed Containers now use `ctx.container.images` without Wrangler generating `env.EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES`. Update code using the experimental environment binding to read `ctx.container.images` and regenerate your Worker types.

Version deployments identify managed applications from native named images, and `--containers-rollout=none` preserves native Container metadata. Containers without named images must first be provisioned with `wrangler deploy`; `versions upload` verifies that their applications already exist. The old binding is no longer read or reserved, including on previously uploaded versions. `keep_vars` retains existing variables as usual; redeploy without it to remove an existing experimental binding.
