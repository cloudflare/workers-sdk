---
"@cloudflare/vitest-pool-workers": patch
---

Fix vitest-pool-workers hanging when the default inspector port (9229) is already in use. When debugging is enabled and the default port is unavailable, the pool now automatically finds the next available port. If a user explicitly specifies an inspector port that is unavailable, an error is thrown with a clear message.
