---
"wrangler": minor
---

Emit a typed `runtimeError` event on the `unstable_startWorker` DevEnv for uncaught Worker exceptions

Uncaught Worker exceptions were only source-mapped and printed, so programmatic consumers had to scrape terminal output to observe them. The DevEnv now re-emits a `RuntimeErrorEvent` (like `reloadComplete`) carrying the exception text and source-mapped stack — fed from Miniflare's pretty-error seam via the new `handleUncaughtError` option for exceptions the runtime catches, and from the inspector for those it does not.
