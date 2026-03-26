---
"@cloudflare/vitest-pool-workers": patch
---

Support `@voidzero-dev/vite-plus-test` as an alternative to `vitest`

Users running tests via [Vite+](https://github.com/voidzero-dev/vite-plus) (`@voidzero-dev/vite-plus-test`) with the [recommended pnpm overrides](https://github.com/voidzero-dev/vite-plus/blob/main/packages/test/BUNDLING.md) no longer hit spurious version warnings or `Disallowed operation called within global scope` errors.

- The version compatibility check now reads the `bundledVersions.vitest` field from the distribution's `package.json` to determine the real upstream Vitest version, instead of comparing against the distribution's own version number.
- The `setTimeout` monkeypatch in the worker entry now recognises calls originating from `@voidzero-dev/vite-plus-test`, allowing its eager fake-timer initialisation to proceed without being blocked by the global-scope guard.
