---
"wrangler": patch
---

Derive `nodejsCompatMode` from the effective compatibility inputs in `unstable_startWorker()`

The CLI computes the node-compat mode from the effective compatibility date and flags (`args.* ?? parsedConfig.*`), but the programmatic path used `input.build.nodejsCompatMode` raw — leaving it unset meant a worker's `nodejs_compat` flag (from its config file or from input-level `compatibilityFlags`) was silently ignored, so bundling failed to resolve node builtins that `wrangler dev` handles. `startWorker` now derives the mode the same way when the caller does not provide one: input-level `compatibilityDate`/`compatibilityFlags` first, then the resolved config, with no-bundle taken from the resolved `build.bundle` semantics. Passing an explicit `null` still disables it.
