---
"@cloudflare/vitest-plugin": patch
---

Resolve the runner's `vitest/worker` import from the plugin, not from the project root

The runner is a virtual module, `/index.mjs`, so Vite resolved its `vitest/worker` import from the project root. When the root could not resolve `vitest`, as in a pnpm workspace whose root package does not depend on it, no test file ran and Workers threw `No such module "vitest/worker"`. When a parent directory had another `vitest` version, the runner loaded that version and Vitest failed to find the runner. The plugin now resolves `vitest/worker` from its own package, so the runner uses the same Vitest as the pool.
