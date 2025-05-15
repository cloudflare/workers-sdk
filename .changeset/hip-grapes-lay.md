---
"wrangler": patch
---

Wire up mixed-mode remote bindings

Under the `--x-mixed-mode` flag, make sure that bindings configurations with `remote: true` actually generate bindings to remote resources, currently the bindings included in this are: services, kv_namespaces, r2_buckets, d1_databases, queues and workflows.

Also include the ai binding since the bindings is already remote by default anyways.
