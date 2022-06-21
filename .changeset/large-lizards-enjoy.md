---
"wrangler": patch
---

feat: resolve `--site` cli arg relative to current working directory

Before we were resolving the Site directory relative to the location of `wrangler.toml` at all times.
Now the `--site` cli arg is resolved relative to current working directory.

resolves #1243
