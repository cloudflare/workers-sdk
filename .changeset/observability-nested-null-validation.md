---
"@cloudflare/workers-utils": patch
---

Report a null `observability.logs`/`observability.traces` as a config error instead of crashing

Setting `observability.logs` or `observability.traces` to `null` in your Wrangler configuration previously crashed with an unhandled error instead of reporting a configuration problem.

Null is now rejected with a normal config error, matching how a null top-level `observability` is already handled.
