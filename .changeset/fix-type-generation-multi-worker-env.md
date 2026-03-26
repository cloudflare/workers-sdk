---
"wrangler": patch
---

fix: resolve secondary worker types when environment overrides the worker name in multi-worker type generation

When running `wrangler types` with multiple `-c` config flags and the secondary worker has named environments that override the worker name (e.g. a worker named `do-worker` with env `staging` whose effective name becomes `do-worker-staging`), service bindings and Durable Object bindings in the primary worker that reference `do-worker-staging` now correctly resolve to the typed entry point instead of falling back to an unresolved comment type such as `DurableObjectNamespace /* MyClass from do-worker-staging */`.

The fix extends the secondary entries map to also register environment-specific worker names, so that lookups by the env-qualified name (e.g. `do-worker-staging`) resolve to the same source file as the base worker name.
