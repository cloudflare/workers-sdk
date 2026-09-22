---
"miniflare": patch
---

Handle client socket errors in the Hyperdrive proxy

The local Hyperdrive proxy pipes the client socket and the database socket together. Only the database side had an `error` listener, so an error on the client socket, for example an `EPIPE` when the client goes away while the database is still writing, had no listener and took down the whole Node process.

Both sockets are now piped through a single helper that tears down each side when either one errors.
