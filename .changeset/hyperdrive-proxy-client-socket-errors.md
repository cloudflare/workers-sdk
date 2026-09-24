---
"miniflare": patch
---

Prevent Hyperdrive bindings from crashing local dev when a connection fails

Miniflare's local Hyperdrive proxy watched for errors on the database connection but not on the one coming from the Worker. A Worker that hung up while the database was still writing, or a connection reset during TLS negotiation, raised an unhandled error that exited `wrangler dev`, `getPlatformProxy()` or a Vitest run.

The proxy now watches both sides for the whole life of the connection and closes one when the other fails. A connection opened towards the database after the Worker had already gone is now closed instead of left open. Connection strings using `sslmode=disable` are unaffected, since that mode connects directly and skips the proxy.
