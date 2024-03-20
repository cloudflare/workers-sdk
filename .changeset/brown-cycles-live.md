---
"miniflare": minor
---

feature: customisable unsafe direct sockets entrypoints

Previously, Miniflare provided experimental `unsafeDirectHost` and `unsafeDirectPort` options for starting an HTTP server that pointed directly to a specific Worker. This change replaces these options with a single `unsafeDirectSockets` option that accepts an array of socket objects of the form `{ host?: string, port?: number, entrypoint?: string }`. `host` defaults to `127.0.0.1`, `port` defaults to `0`, and `entrypoint` defaults to `default`. This allows you to start HTTP servers for specific entrypoints of specific Workers.

Note these sockets set the `capnpConnectHost` `workerd` option to `"miniflare-unsafe-internal-capnp-connect"`. `external` `serviceBindings` will set their `capnpConnectHost` option to the same value allowing RPC over multiple `Miniflare` instances. Refer to https://github.com/cloudflare/workerd/pull/1757 for more information.
