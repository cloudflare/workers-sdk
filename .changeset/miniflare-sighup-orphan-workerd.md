---
"miniflare": patch
---

Shut down `workerd` when Miniflare is terminated with `SIGHUP`

On `SIGHUP`, Miniflare now stops `workerd` and removes its temporary directory instead of leaving them behind. Previously only `SIGINT` and `SIGTERM` were handled, so tools that embed Miniflare, such as `@cloudflare/vitest-pool-workers` and `@cloudflare/vite-plugin`, could leave a stray process and directory behind on each run.
