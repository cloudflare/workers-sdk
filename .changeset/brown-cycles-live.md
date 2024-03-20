---
"miniflare": minor
---

feature: customisable unsafe direct sockets entrypoints

Previously, Miniflare provided experimental `unsafeDirectHost` and `unsafeDirectPort` options for starting an HTTP server that pointed directly to a specific Worker. This change replaces these options with a single `unsafeDirectSockets` option that accepts an array of socket objects of the form `{ host?: string, port?: number, entrypoint?: string, proxy?: boolean }`. `host` defaults to `127.0.0.1`, `port` defaults to `0`, `entrypoint` defaults to `default`, and `proxy` defaults to `false`. This allows you to start HTTP servers for specific entrypoints of specific Workers. `proxy` controls the [`Style`](https://github.com/cloudflare/workerd/blob/af35f1e7b0f166ec4ca93a8bf7daeacda029f11d/src/workerd/server/workerd.capnp#L780-L789) of the socket.

Note these sockets set the `capnpConnectHost` `workerd` option to `"miniflare-unsafe-internal-capnp-connect"`. `external` `serviceBindings` will set their `capnpConnectHost` option to the same value allowing RPC over multiple `Miniflare` instances. Refer to https://github.com/cloudflare/workerd/pull/1757 for more information.
