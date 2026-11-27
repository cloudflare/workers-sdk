---
"@cloudflare/vite-plugin": minor
"@cloudflare/config": minor
---

Add experimental per-Worker `cloudflare:workers/<name>` modules

With `experimental: { perWorkerModules: true }`, code in a Worker can import `env`, `WorkerEntrypoint` and `DurableObject` from `cloudflare:workers/<name>`, where `<name>` is that Worker's name. They are typed with that Worker's `env` instead of the global `Env`, so auxiliary Workers get their own types. Importing another Worker's module fails the build; use `import type` to share types between Workers.

**Experimental feature**: This could change or be removed at any time.
