---
"@cloudflare/vitest-pool-workers": patch
---

Reject V8 coverage provider with a clear error message

V8 native code coverage (`@vitest/coverage-v8`) requires `node:inspector` to collect profiling data from V8's runtime. workerd only provides `node:inspector` as a non-functional stub, so V8 coverage would silently fail or crash with a confusing `No such module "node:inspector"` error.

The pool now detects this configuration early — during Vite plugin setup, before Vitest tries to load the coverage provider — and throws a clear error directing users to use Istanbul coverage instead, which works by instrumenting source code at build time and runs on any JavaScript runtime.
