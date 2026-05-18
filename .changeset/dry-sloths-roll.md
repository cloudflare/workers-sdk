---
"@cloudflare/containers-shared": minor
"wrangler": minor
---

Add `--containers-rollout=none`

This allows you to skip deploying a container. This is useful if you know that your container is not going to be updated or you don't have Docker locally, but still want to make changes to your Worker.
