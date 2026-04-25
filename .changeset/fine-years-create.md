---
"wrangler": patch
---

Wrangler types decouple env-interface from namespace.

The `wrangler types` command now adds a `InternalEnv` (name derived from `Internal${--env-interface}`) interface which is then extended by `Cloudflare.Env` and the `--env-interface`
