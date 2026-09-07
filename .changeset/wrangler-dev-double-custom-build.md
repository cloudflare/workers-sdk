---
"wrangler": patch
---

Fix `wrangler dev` running the custom build command twice on startup and on every config change

Wrangler already runs the custom `build.command` once before starting `wrangler dev`, to resolve the Worker's entry point. When `dev.watch` wasn't explicitly disabled, `BundlerController` then unconditionally ran the same build command again the moment it started watching for changes, and repeated this on every subsequent config reload too.

For fast build commands this just meant duplicate log output (e.g. a `vite build` visibly running twice at startup). For slower or stateful build commands, running two builds concurrently against the same output files could corrupt the result or fail outright (for example, non-deterministic `wasm-opt` failures have been reported for Rust builds).

The initial watcher setup now only bundles the output the build command already produced, instead of re-running the command. Real file changes detected by the watcher still re-run the build command as before.
