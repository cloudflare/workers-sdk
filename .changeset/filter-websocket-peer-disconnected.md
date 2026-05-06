---
"@cloudflare/vitest-pool-workers": patch
---

Filter benign `disconnected: WebSocket peer disconnected` workerd stderr noise during test runs.

The `ignoreMessages` array in the pool already filters several benign workerd disconnect messages (e.g. `disconnected: WebSocket was aborted`). On recent workerd versions, tests that exercise the WebSocket API also surface `disconnected: WebSocket peer disconnected` warnings during normal teardown. These are not user-actionable and obscure real test failures. Add the message to the existing filter alongside the other `disconnected:` entries.
