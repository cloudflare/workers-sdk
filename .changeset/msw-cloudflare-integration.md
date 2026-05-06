---
"@cloudflare/vitest-pool-workers": patch
---

Remove the internal `msw/node` → `msw/native` remap and `globalThis.fetch` rebinding hacks

Previously, `@cloudflare/vitest-pool-workers` rewrote imports of `msw/lib/node/index.mjs` to point at MSW's `msw/native` build, and rebound `globalThis.fetch` to itself, so that `setupServer()` from `msw/node` would intercept fetch calls inside the workerd runtime. With recent versions of MSW (>= 2.14), neither workaround is required, and we now recommend using the official [`@msw/cloudflare`](https://github.com/mswjs/cloudflare) integration via `setupNetwork()` for declarative request mocking inside Worker tests. Both hacks have been removed.

If you were previously relying on `setupServer()` from `msw/node` inside Worker tests, you can either continue to use it directly (no changes needed) or migrate to `setupNetwork()` from `@msw/cloudflare`. See the updated `request-mocking` example fixture for the recommended pattern.
