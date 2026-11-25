---
"wrangler": minor
"@cloudflare/containers-shared": minor
"@cloudflare/workers-utils": minor
---

Add `--jurisdiction` to `wrangler containers build`, `push`, and `images`

`wrangler containers build --push`, `wrangler containers push`, `wrangler containers images list`, and `wrangler containers images delete` now accept `--jurisdiction` to use a jurisdiction's managed registry instead of the default registry:

```sh
wrangler containers push app:v1 --jurisdiction eu
# Pushed image: eu.registry.cloudflare.com/<account-id>/app:v1
```

- `eu`: `eu.registry.cloudflare.com`
- `fedramp`: `frm.registry.cloudflare.com`
- `us`: `us.registry.cloudflare.com`

The option is ignored in the FedRAMP High compliance region, which has a single registry. `wrangler containers build` accepts it only together with `--push`. Image names without a registry in Wrangler configuration still resolve to the default registry, so refer to images pushed this way by their full reference.
