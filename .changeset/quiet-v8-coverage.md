---
"@cloudflare/vitest-plugin": patch
---

Fix V8 coverage failing with Vitest 5.0.4

Tests using V8 coverage with Vitest 5.0.4 no longer fail with an assertion error during teardown.
