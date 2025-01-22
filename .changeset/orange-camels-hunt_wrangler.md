---
"wrangler": minor
---

allow `unstable_getMiniflareWorkerOptions` to always accept an `env` argument

the `unstable_getMiniflareWorkerOptions` utility, when accepting a config object as its first argument,
doesn't accept an `env` one, the changes here make sure it does since even if a config object is passed
the `env` one is still relevant for picking up variables from potential `.dev.vars` files
