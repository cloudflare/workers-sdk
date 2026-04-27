---
"wrangler": patch
---

Fix three resource leaks in `unstable_startWorker` teardown that could prevent Node from exiting cleanly after `worker.dispose()`.

- The esbuild context created by `bundleWorker` is now disposed when the initial build fails. Previously a failing initial build (e.g. an unresolvable entrypoint, or a worker started with an invalid config via `setConfig`) left the esbuild child process running for the lifetime of the parent Node process.
- `runBuild`'s cleanup function now awaits the in-flight build before running the bundler's stop handler. Previously teardown could return before `esbuild.BuildContext.dispose()` had been called, so the esbuild watcher kept the event loop alive after dispose had resolved.
- `BundlerController.teardown()` now runs the esbuild cleanup before removing the bundler's temporary directory, and aborts the in-flight bundle build so it cannot emit stale `bundleStart`/`bundleComplete` events after teardown. Previously the tmpdir was removed first, which in race with an in-flight rebuild produced confusing "Could not resolve `.wrangler/tmp/bundle-XXXX/middleware-loader.entry.ts`" errors during dispose.
