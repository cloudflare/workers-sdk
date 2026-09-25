---
"@cloudflare/vitest-plugin": minor
---

Support standard decorators in Worker code and tests

Tests failed to load with `SyntaxError: Invalid or unexpected token` when a Worker or a test file used standard (TC39) decorators, because the Workers runtime cannot parse decorator syntax and Vite does not lower it. `cloudflareTest()` now lowers standard decorators. Modules without decorators are not changed.
