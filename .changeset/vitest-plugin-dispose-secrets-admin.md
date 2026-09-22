---
"@cloudflare/vitest-plugin": patch
---

Declare the `adminSecretsStore()` result as disposable and show `using` in its example

The admin API it returns is backed by RPC stubs. Its type left out `Symbol.dispose` and the documented example never released them, so a test that followed it made workerd warn that an RPC stub was not disposed properly. `using admin = adminSecretsStore(env.MY_SECRET)` now type checks and releases the stubs at the end of the scope.
