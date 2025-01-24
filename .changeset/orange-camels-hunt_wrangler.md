---
"wrangler": minor
---

Update the `unstable_getMiniflareWorkerOptions` types to always include an `env` parameter.

The `unstable_getMiniflareWorkerOptions` types, when accepting a config object as the first argument,
didn't accept a second `env` argument. The changes here make sure they do, since the `env` is still
relevant for picking up variables from potential `.dev.vars` files.
