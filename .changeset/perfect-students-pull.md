---
"wrangler": patch
---

fix: automatically create required directories for `wrangler r2 object get`

Previously, if you tried to use `wrangler r2 object get` with an object name containing a `/` or used the `--file` flag with a path containing a `/`, and the specified directory didn't exist, Wrangler would throw an `ENOENT` error. This change ensures Wrangler automatically creates required parent directories if they don't exist.
