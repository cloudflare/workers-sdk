---
"wrangler": patch
---

worker_metadata binding

Added new binding `worker_metadata` in top level Wrangler config. Which will be used to provide a custom namespace for accessing your Workers
metadata from the `Env` in runtime.

example:

```toml
main = "./src/index.ts"
compatibility_date = "2022-09-29"
name = "website"
worker_metadata = "my-worker-metadata"
```

resolves #2113
