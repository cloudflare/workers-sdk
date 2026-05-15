---
"wrangler": patch
---

Sweep stale `.wrangler/tmp/*` dirs left behind by abnormal exits

A `wrangler dev` session creates `.wrangler/tmp/bundle-*` and `.wrangler/tmp/dev-*` directories at startup and removes them via a `signal-exit` hook on graceful shutdown. When the process exited abnormally (SIGKILL, OOM, host crash) those directories were left behind and accumulated across sessions, slowing down dependency-walking tools that follow the bundle-emitted absolute-path imports.

`wrangler` now sweeps entries in `.wrangler/tmp/` older than 24 hours when a new temporary directory is requested, bounding the leak regardless of how prior sessions exited.
