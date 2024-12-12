---
"wrangler": patch
---

The `x-provision` experimental flag now identifies draft and inherit bindings by looking up the current binding settings.

Draft bindings can then be provisioned (connected to new or existing KV, D1, or R2 resources) during `wrangler deploy`.
