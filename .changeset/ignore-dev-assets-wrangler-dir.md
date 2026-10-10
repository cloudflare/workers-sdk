---
"wrangler": patch
---

Ignore `.wrangler` writes in the dev assets watcher

`wrangler dev` reloaded in a loop when `assets.directory` was the project root, because the assets watcher treated wrangler's own writes under `.wrangler` as asset changes and dropped in-flight requests. The watcher now ignores the directories this dev session writes, including `.wrangler` and a custom persist directory, only when they sit inside the assets root.
