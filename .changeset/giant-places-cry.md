---
"@cloudflare/vitest-pool-workers": patch
---

fix: resolve CJS alternatives when `require()` picks up an ESM file via the "import" export condition

workerd always uses the "import" condition even for `require()` calls, which can cause it to resolve to an ESM file instead of the intended CJS entry. The module fallback service now inspects the package's `exports` map to find a matching "require" or "default" entry and redirects to the CJS file when one exists. This also handles packages that expose `workerd` or `worker` conditions with CJS-compatible entries (e.g. `pg-cloudflare`).
