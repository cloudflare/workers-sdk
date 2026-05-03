---
"@cloudflare/vitest-pool-workers": patch
---

Rewrite self-referencing service bindings to `kCurrentWorker` before renaming the runner worker

When a wrangler config has a service binding to itself (e.g. `services: [{ binding: "SELF", service: "my-worker" }]` where the worker is named `"my-worker"`), the binding's literal name pointed to a worker that no longer existed once vitest-pool-workers renamed the runner to `vitest-pool-workers-runner-<project>`. The self-reference is now rewritten to the miniflare `kCurrentWorker` symbol, which resolves at request time relative to the referer worker and so survives the rename. Previously this rewrite lived in wrangler's `unstable_getMiniflareWorkerOptions`, but it's only needed for vitest-pool-workers' rename — other consumers (`getPlatformProxy`, `@cloudflare/vite-plugin`) preserve the original worker name and so don't need it.
