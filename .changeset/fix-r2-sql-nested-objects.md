---
"wrangler": patch
---

Fix `wrangler r2 sql query` displaying `[object Object]` for nested values

SQL functions that return complex types such as arrays of objects (e.g. `approx_top_k`) were rendered as `[object Object]` in the table output because `String()` was called directly on non-primitive values. These values are now serialized with `JSON.stringify` so they display as readable JSON strings.
