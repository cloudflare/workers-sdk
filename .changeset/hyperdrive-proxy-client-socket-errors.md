---
"miniflare": patch
---

Handle client socket errors in the Hyperdrive proxy

The local Hyperdrive proxy pipes the client socket and the database socket together. Only the database side had an `error` listener, so an error on the client socket — an `EPIPE` when the client goes away while the database is still writing, or a reset while the proxy is still negotiating TLS — had no listener and took down the whole Node process.

The client socket now gets a listener as soon as the connection is accepted, and both sockets are piped through a single helper that tears down each side when either one errors.
