---
"wrangler": patch
---

Fix `wrangler types` resolution for env-qualified service entrypoints

`wrangler types` now resolves named `services` entrypoints back to the secondary Worker's source module when the secondary config uses an environment-specific `name` override. This restores strongly typed `Service<typeof import(...).Entrypoint>` output for multi-config type generation instead of falling back to an unresolved `Service` comment.
