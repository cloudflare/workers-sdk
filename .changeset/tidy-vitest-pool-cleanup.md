---
"@cloudflare/vitest-plugin": patch
---

Dispose Miniflare when a Vitest runtime fails to start

Previously, a Miniflare instance whose startup failed was never disposed, so anything it had already started kept running. If disposal also fails, the original startup error is still reported.
