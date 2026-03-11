---
"@cloudflare/vitest-pool-workers": minor
---

Lower vitest peer dependency from `4.1.0-beta.4` to `^4.0.18`

Users can now use `@cloudflare/vitest-pool-workers` with the stable `vitest@4.0.x` release line instead of requiring a beta version. The `vitest/snapshot` subpath is used instead of `vitest/runtime` for the snapshot environment import, which is available across both 4.0.x and 4.1.x.
