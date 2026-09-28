---
"@cloudflare/config": patch
---

Fix environment types for Worker configurations inferred as unions

`InferEnv` and generated Worker `Env` types now include every binding and runtime type that the configuration can produce. Bindings that are not always present are optional.
