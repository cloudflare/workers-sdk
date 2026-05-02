---
"wrangler": patch
---

Fix `props` and fetcher-type service bindings being dropped in `unstable_getMiniflareWorkerOptions`

The post-processing in `unstable_getMiniflareWorkerOptions` was rebuilding `serviceBindings` from scratch, which silently dropped `props` on service bindings and dropped `fetcher`-type bindings entirely. It was also re-deriving `durableObjects` identically to what `buildMiniflareBindingOptions` already produces.

The post-processing has been simplified to only rewrite self-referencing service bindings (where `service === config.name`) to use the `kCurrentWorker` symbol, which is necessary so self-references survive consumer-specific worker renames (e.g. vitest-pool-workers renames the runner to `vitest-pool-workers-runner-<project>`). All other fields — including `props` and fetcher-type bindings — are now preserved, and the redundant `durableObjects` re-derivation has been removed.
