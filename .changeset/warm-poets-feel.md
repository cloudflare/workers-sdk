---
"@cloudflare/vitest-pool-workers": patch
---

fix: Add usage charge warning when Vectorize and AI bindings are used in Vitest

Vectorize and AI bindings can now be used with Vitest. However, because they have no local simulators, they will access your account and incur usage charges, even in testing. Therefore we recommend mocking any usage of these bindings when testing.
