---
"wrangler": patch
---

Ignore `.wrangler` writes in the dev assets watcher

`wrangler dev` reloaded in a loop when `assets.directory` was the project root, because the assets watcher treated wrangler's own writes under `.wrangler` as asset changes and dropped in-flight requests. The watcher now ignores the project's `.wrangler` directory and `dev.persist`, except when that path is the assets directory.
