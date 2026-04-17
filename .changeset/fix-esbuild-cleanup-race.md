---
"wrangler": patch
---

fix: ensure esbuild context is disposed during teardown

The esbuild bundler cleanup function could race with the initial build. If `BundlerController.teardown()` ran before the initial `build()` completed, the `stopWatching` closure variable would still be `undefined`, so the esbuild context was never disposed. This left the esbuild child process running, keeping the Node.js event loop alive and causing processes to hang instead of exiting cleanly.

The cleanup function now awaits the build promise before calling `stopWatching`, ensuring the esbuild context is always properly disposed.
