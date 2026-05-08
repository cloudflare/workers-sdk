---
"wrangler": patch
---

Fix unhandled `AbortError` from `wrangler dev`'s remote tail WebSocket when the bundle rebuilds or the dev session shuts down

The remote-runtime tail-logs WebSocket (`#activeTail` in `RemoteRuntimeController`) was constructed with the same `AbortSignal` that `onBundleStart` aborts to cancel in-flight preview-session operations. The abort destroyed the WebSocket's underlying upgrade request with `AbortError`, which had no `error` listener attached and propagated as an unhandled exception. We now attach an `error` listener at WebSocket construction that ignores errors (logging at debug level), matching the safeguards already present on the `terminate` paths in `#previewToken` and `teardown()`.
