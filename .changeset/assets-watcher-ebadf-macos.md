---
"wrangler": patch
---

Fix `wrangler dev` crashing with `spawn EBADF` on macOS when the assets directory contains many files

On macOS, chokidar 4 opens one `fs.watch` handle per asset file. Past the process file-descriptor limit this makes child-process spawns fail with `EBADF`, so `wrangler dev` exits. `wrangler dev` now watches the assets directory with a single recursive `fs.watch` on macOS and Windows, which uses one native handle for the whole tree.
