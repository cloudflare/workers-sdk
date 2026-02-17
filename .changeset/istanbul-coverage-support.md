---
"@cloudflare/vitest-pool-workers": minor
---

Add Istanbul code coverage support. Coverage data populated inside the workerd runtime is now bridged back to the Node.js process, enabling `coverage.provider: 'istanbul'` to produce accurate reports. Files loaded through the module fallback service are also instrumented when coverage is enabled.
