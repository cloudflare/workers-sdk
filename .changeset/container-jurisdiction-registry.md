---
"wrangler": minor
"@cloudflare/containers-shared": minor
---

Push Container images to the registry for `constraints.jurisdiction`

For Containers using the default scheduling policy, images built from a Dockerfile are now pushed to the managed registry for the Container's `constraints.jurisdiction` in the public compliance region:

- `eu`: `eu.registry.cloudflare.com`
- `fedramp`: `frm.registry.cloudflare.com`
- `us`: `us.registry.cloudflare.com`

This applies to `wrangler deploy` and preview deployments. An existing Container with a jurisdiction gets a new image reference on its next deployment, which starts a rollout even when the image is otherwise unchanged.

Containers without a jurisdiction, prebuilt `image` references, and the FedRAMP High compliance region keep their current registry.
