---
"wrangler": patch
---

Stop `wrangler dev` from running custom builds concurrently

When several watched files changed at once — for example during a `git pull` or a "save all" — `wrangler dev` started a custom build for every file that changed, so multiple copies of your build command ran at the same time and fought over the same output files.

A burst of file changes now results in a single build, and a build only starts once the previous one has finished.
