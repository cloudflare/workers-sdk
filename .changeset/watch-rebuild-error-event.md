---
"wrangler": patch
---

Emit an error event for watch-mode rebuild failures in `unstable_startWorker`

Initial build failures already dispatch an error event (surfaced as `buildFailed` on the DevEnv bus), but watch-mode rebuild failures were only logged from inside the esbuild plugin, so programmatic consumers had no way to observe them while dev kept serving the previous bundle. Rebuild failures now route through the same error path as initial-build failures: terminal output is unchanged and `buildFailed` fires symmetrically.
