---
"miniflare": patch
---

fix: ensure `MiniflareOptions`, `WorkerOptions`, and `SharedOptions` types are correct

Miniflare uses Zod for validating options. Previously, Miniflare inferred `*Options` from the _output_ types of its Zod schemas, rather than the _input_ types. In most cases, these were the same. However, the `hyperdrives` option has different input/output types, preventing these from being type checked correctly.
