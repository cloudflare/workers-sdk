---
"miniflare": patch
---

Fix `dispatchFetch()` failing with `ECONNREFUSED` when Miniflare runs on the Bun runtime

Bun resolves the bare `undici` specifier to a built-in module, even when the `undici` package is installed. That module's `fetch()` ignores the `dispatcher` option that Miniflare uses to route requests to workerd, so every `dispatchFetch()` call went to the user-facing origin instead (for example, `@cloudflare/vite-plugin` and `astro dev` crashed on startup). Miniflare now loads the installed `undici` package by path, so the same implementation is used on Node and Bun.
