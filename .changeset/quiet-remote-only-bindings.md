---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Defer remote binding login until the binding is called

Remote proxy sessions authenticate lazily by default in Wrangler, the Cloudflare Vite plugin, and the Vitest plugin. This applies to all remote bindings, including KV and D1 with `remote: true`. The first remote binding call establishes the connection and starts login if needed. Calls wait for login and continue once it succeeds, while unrelated requests keep working. Failed login attempts fail the waiting calls without stopping a running development server. Background refresh does not start login for an unused binding. A binding that the runtime accesses during initialization, such as Hyperdrive, can still trigger login at startup.

Pass `true` for `eagerAuth` to `maybeStartOrUpdateRemoteProxySession()` to authenticate and connect before returning. Wrangler's `getPlatformProxy()` opts in to prevent the first call to bindings such as K2 from blocking the Node.js thread needed to establish the connection.
