---
"wrangler": patch
---

feat: resolve `--assets` cli arg relative to current working directory

Before we were resolving the Asset directory relative to the location of `wrangler.toml` at all times.
Now the `--assets` cli arg is resolved relative to current working directory.

resolves #1333
