---
"@cloudflare/vitest-plugin": patch
---

Fix tests failing to start with `resolve.preserveSymlinks` in isolated `node_modules` layouts

With `resolve.preserveSymlinks: true` in a pnpm project, tests failed to start with `No such module ".../node_modules/vitest/dist/chai"`, because a package's own dependencies are linked only next to its real path. Packages linked from a store inside `node_modules` now load from their real paths, and other files keep their symlinked paths.
