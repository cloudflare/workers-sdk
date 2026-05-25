---
"wrangler": patch
---

Gracefully handle EMFILE error when assets directory exceeds OS watcher limit

Previously, when `wrangler dev` was pointed at an assets directory with more than ~4,096 subdirectories, the chokidar file watcher threw an `EMFILE: too many open files` error that was not caught, causing an infinite error loop that made the dev server unresponsive.

Now the error is caught and wrangler:

1. Logs a clear warning explaining the platform watcher limit was hit
2. Recommends reducing the number of subdirectories by flattening or restructuring the assets directory
3. Disables the assets watcher gracefully so the dev server continues working without hot-reload
