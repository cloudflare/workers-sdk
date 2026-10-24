---
"@cloudflare/vite-plugin": patch
---

Treat `cloudflare:durable-objects` as a built-in runtime module

Workers can import `retryable()` from `cloudflare:durable-objects` to mark Durable Object methods as safe to retry. The plugin now leaves that import for the runtime to resolve, as it does for `cloudflare:workers`, instead of trying to resolve it as a package.
