---
"wrangler": patch
---

Print the bindings a worker has access to during `dev` and `publish`

It can be helpful for a user to know exactly what resources a worker will have access to and where they can access them, so we now log the bindings available to a worker during `wrangler dev` and `wrangler publish`.
