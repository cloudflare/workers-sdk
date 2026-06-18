---
"wrangler": patch
---

`wrangler types` no longer emits `mainModule` when the Worker entrypoint is inside a framework build output directory

When the configured `main` entrypoint lives inside a hidden framework build output directory (e.g. `.svelte-kit`, `.next`, `.nuxt`, `.output`), the generated `mainModule` import pointed `tsc` and `svelte-check` at generated code, causing spurious type errors. The `mainModule` declaration is now skipped for entrypoints inside such directories.
