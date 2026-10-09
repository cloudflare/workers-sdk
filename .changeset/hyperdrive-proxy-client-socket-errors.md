---
"miniflare": patch
---

Prevent Hyperdrive bindings from crashing local dev when a connection fails

A Worker that hung up while the database was still writing, or a connection reset during TLS negotiation, raised an unhandled error in Miniflare's local Hyperdrive proxy that exited `wrangler dev`, `getPlatformProxy()` or a Vitest run. The proxy now closes the other side of the connection instead.
