---
"@cloudflare/vitest-pool-workers": patch
---

fix: define defineWorkersConfig using overload signatures

The type definition of `defineWorkersConfig` doesn't work with `mergeConfig` of `vitest/config` because of type mismatch.
This function should be an overload function like `defineConfig`
