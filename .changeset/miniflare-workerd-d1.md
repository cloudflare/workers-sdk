---
"miniflare": minor
---

Use workerd's built-in D1 for local D1 databases

Local D1 databases are now run by workerd's own D1 Worker rather than simulated by Miniflare. Existing local databases keep their data: they stay in the same directory under the persistence path.

Differences: `meta.served_by` is `"workerd"` and errors thrown by `query()` are named `Error` rather than `D1_ERROR`.
