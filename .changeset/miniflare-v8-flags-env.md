---
"miniflare": minor
---

Support passing V8 flags to `workerd` via the `MINIFLARE_WORKERD_V8_FLAGS` environment variable

The generated `workerd` config already supports `v8Flags`, but Miniflare never populated it, so the runtime always ran with V8's default heap limit (~1.4 GB). Large dev applications (e.g. big SSR module graphs under `@cloudflare/vite-plugin`, where each server-file edit grows the runner isolate's heap) can reach that limit, at which point `workerd` aborts with `V8 fatal error; location = Reached heap limit` and every subsequent `dispatchFetch()` fails with `fetch failed` until the dev server is manually restarted.

Setting e.g. `MINIFLARE_WORKERD_V8_FLAGS="--max-old-space-size=4096"` raises the limit and keeps long dev sessions alive. The variable follows the same space-separated format as `MINIFLARE_WORKERD_AUTOGATES`.
