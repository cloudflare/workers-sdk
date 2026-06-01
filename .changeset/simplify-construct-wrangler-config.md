---
"@cloudflare/workers-utils": minor
---

Simplify `constructWranglerConfig` to accept a single worker instead of an array

The `constructWranglerConfig` function now accepts a single `APIWorkerConfig` object instead of `APIWorkerConfig | APIWorkerConfig[]`. The multi-environment array support has been removed since the array use-case was removed and now the only call site already passes a single worker object. This is a breaking change to the function's public signature.
