---
"wrangler": patch
---

Fix local binding conflicts in multi-worker dev mode

When using `wrangler dev` with multiple config files (`-c path1 -c path2`), bindings (D1 databases, KV namespaces, R2 buckets) from different workers that had the same binding name would incorrectly share the same local storage. For example, if two workers both had a D1 database binding named "DB", they would end up using the same local database file.

This fix namespaces local binding IDs with the worker name for secondary workers, ensuring each worker gets its own isolated storage. Remote bindings are not affected by this change.
