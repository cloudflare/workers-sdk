---
"@cloudflare/vitest-pool-workers": patch
---

Support `@voidzero-dev/vite-plus-test` as an alternative to `vitest`

Users running tests via [Vite+](https://github.com/voidzero-dev/vite-plus) (`@voidzero-dev/vite-plus-test`) with the [recommended pnpm overrides](https://github.com/voidzero-dev/vite-plus/blob/main/packages/test/BUNDLING.md) no longer hit spurious version warnings or `Disallowed operation called within global scope` errors.
