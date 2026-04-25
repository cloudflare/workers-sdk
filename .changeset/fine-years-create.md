---
"wrangler": patch
---

Wrangler types decouple env-interface from namespace.

The `wrangler types` command now adds an `InternalEnv` interface (name derived from `Internal${--env-interface}`) which is then extended by `Cloudflare.Env` and the `--env-interface`
