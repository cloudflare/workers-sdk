---
"wrangler": patch
---

Ignore `.wrangler` writes in the dev assets watcher

`wrangler dev` reloaded in a loop when `assets.directory` was the project root, because the assets watcher treated wrangler's own `.wrangler` writes as asset changes and dropped in-flight requests. The assets watcher now ignores `.wrangler`, the same way the no-bundle watcher already does.
