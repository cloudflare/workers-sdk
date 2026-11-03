# Miniflare API Proxy

Miniflare provides methods for accessing bindings from Node.js, outside a
`workerd` process. These are implemented by an API proxy. The directory
implements the client for this. The server is implemented as a Durable Object in
[`src/workers/core/proxy.worker.ts`](../../../workers/core/proxy.worker.ts).

Using a Durable Object allows us to share references containing I/O objects like
streams across requests. The Durable Object contains a "heap", mapping addresses
to references. The "heap" is initialised with `globalThis` and `env`.

The client talks to the server in two ways:

- A [Cap'n Web](https://github.com/cloudflare/capnweb) session over a WebSocket,
  used for everything asynchronous. This never blocks the main thread.
- Synchronous HTTP requests, made by a worker thread while the main thread
  waits with `Atomics.wait()` (see [`fetch-sync.ts`](./fetch-sync.ts)). These
  are only used where an API must return synchronously, as blocking prevents
  the main thread doing anything else, including serving requests the runtime
  makes back to Node.

## Workers RPC objects

Objects that speak Workers RPC (service bindings, Durable Object stubs,
`RpcTarget`s and functions) are used through Cap'n Web stubs. Calls, property
accesses, promise pipelining and callbacks are forwarded by Cap'n Web, so these
behave like Workers RPC. The proxy only intercepts:

- `fetch()` on service bindings and Durable Object stubs, which is sent with
  `dispatchFetch()` to support WebSockets.
- `id` and `name` on Durable Object stubs, which are synchronous properties.

Values follow Cap'n Web's rules, which currently differ from Workers RPC: `Map`,
`Set`, `RegExp` and `File` can't be sent, and object keys like `constructor`
that exist on `Object.prototype` are dropped. Arguments are also limited to
32 MiB once serialised, including base64 encoding of bytes, and calls exceeding
this throw a `RangeError`.

## Native objects

Other objects (e.g. `KVNamespace`, `R2Object`, `DurableObjectNamespace`) may
have synchronous methods and properties, so the client builds proxies for them.
Accessing a property on a proxy will result in a synchronous `GET` operation to
the proxy server. If the property is not a method, the value will be serialised
back to the client. Note this may involve putting more references on the
"heap".

If the property is a method, the client will return a function from the access.
Calling this function will perform a synchronous `CALL` operation. If this
returns a `Promise`, the server stores it on the "heap", and the client resolves
it over Cap'n Web. The client remembers which methods of each type are functions,
and which return `Promise`s. Future accesses to the same method on objects of the
same type won't make a synchronous `GET`, and calls to async methods are sent
straight over Cap'n Web.

Calls with `ReadableStream`, `Blob` or function arguments are always sent over
Cap'n Web. Streams can't be read while the main thread is blocked.

Values Cap'n Web can't serialise itself (e.g. "heap" references, `Map`s,
`File`s and objects with keys like `constructor`) are encoded as plain objects
with a `__miniflareProxy` key. `workerd` closes WebSockets receiving messages
over 32 MiB, ending the session, so strings and bytes over 64 KiB are sent as
streams, and calls that would still exceed the limit are rejected before
they're sent. Cap'n Web also only revives the names of built-in errors, so
other names are sent separately and restored by the client.

If the function call threw, or returned a `Promise` that rejected, the error
will be re-thrown/rejected in the client. Note that the stack trace will be
updated to reflect the calling location in the client, not the server.

## Lifetimes

To prevent unbounded growth of the "heap", all proxies are registered with a
`FinalizationRegistry`. When the proxy is garbage collected, the corresponding
"heap" entry is removed allowing it to be garbage collected on the server too.

Stubs returned by Workers RPC calls are released when garbage collected, or
can be disposed sooner. Results of calls that are never awaited are released
when the session closes.

When `workerd` is restarted with `Miniflare#setOptions()` or stopped with
`Miniflare#dispose()`, the Cap'n Web session is closed and all proxies are
_poisoned_. Once a proxy is poisoned, it cannot be used, and must be recreated.
Poisoned proxies are unregistered from the `FinalizationRegistry` too, as the
addresses they point too will be invalid and shouldn't be freed again.
