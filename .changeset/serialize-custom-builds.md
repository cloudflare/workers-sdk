---
"wrangler": patch
---

Stop `wrangler dev` from running custom builds concurrently

When several watched files changed at once — for example during a `git pull` or a "save all" — `wrangler dev` started a custom build for every file change event, so multiple copies of your build command ran at the same time and fought over the same output files.

Custom builds triggered by the file watcher are now debounced and queued, so a burst of file changes results in a single build, and a build only starts once the previous one has exited.
