---
"wrangler": patch
---

Fix remote Hyperdrive bindings rejecting connections after a long-idle `getPlatformProxy()` session

The edge mints per-session credentials for a remote Hyperdrive binding when the session starts, and only `wrangler dev` and `vitest-pool-workers` re-derive them — both call back into the same session/seed logic on every file-triggered reload. `getPlatformProxy()` builds one session for the life of the host process and never calls back in, so a long-idle session (observed after roughly 5-8 hours) had every remote Hyperdrive connection rejected by the edge, recoverable only by restarting the process.

Sessions with a remote Hyperdrive binding now periodically re-fetch their edge credentials for as long as the session lives, keeping the edge's per-session state alive without requiring a restart.
