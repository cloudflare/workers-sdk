# Miniflare API Proxy

Miniflare provides methods for accessing bindings from Node.js, outside a
`workerd` process. These are implemented by an API proxy that forwards accesses
and calls over [Cap'n Web](https://github.com/cloudflare/capnweb). The directory
implements the client for this. The server is implemented as a Durable Object in
[`src/workers/core/proxy.worker.ts`](../../../workers/core/proxy.worker.ts).

Using a Durable Object allows us to share references containing I/O objects like
streams across requests. The client opens a Cap'n Web WebSocket session with the
`ProxyServer`, and gets a stub for each binding by name. Bindings are wrapped
in a `Forwarder` by the server, which forwards property gets and method calls
to the binding. The result of every call is wrapped in a `Forwarder` too, so
calls can be pipelined on it without awaiting it first, whatever it is.
Awaiting it gets its value. Cap'n Web's export table holds these objects, and
they're released when the client disposes its stubs.

Values are sent with a codec shared by the client and server
([`src/workers/core/proxy-codec.ts`](../../../workers/core/proxy-codec.ts)), in
both directions. This supports values Cap'n Web can't send itself, such as
`Map`s, `Set`s, `File`s, custom error names, and objects with keys like
`constructor`, so native bindings and objects that speak Workers RPC have the
same fidelity. Large strings, bytes and `Blob`s, and large chunks of streams,
are split into chunks, as `workerd` closes WebSockets receiving messages over
32 MiB. Calls with more data than this left in strings and bytes are rejected
before they're sent.

Some objects are returned with their data, so their synchronous properties and
methods can be implemented by the client: `R2Object`s, `R2ObjectBody`s,
`R2MultipartUpload`s, Workflow instances and Images transformation results.
Durable Object IDs are created by the client, and revived by the server from
the name or string they were created with. Values synchronous APIs must return
that only the server knows (`DurableObjectId#toString()`, IDs from
`newUniqueId()`, and D1 sessions' `getBookmark()`) are fetched by blocking the
main thread with `Atomics.wait()` until a worker thread receives a response.

`fetch()` on `Fetcher`s and Durable Object stubs is sent with `dispatchFetch()`
rather than Cap'n Web, using a token the server gives the client for the
target. This gives us WebSocket support, and avoids serialising the request and
response.

The sources of stubs proxies use are registered with a `FinalizationRegistry`.
When they're garbage collected, the stubs are disposed, allowing the server to
release the objects they point to. Proxies derived from others (e.g. for a
property) share their source, keeping it alive. If the session closes
unexpectedly, bindings get new stubs on a new session, but objects returned
over the old session can no longer be used.

When `workerd` is restarted with `Miniflare#setOptions()` or stopped with
`Miniflare#dispose()`, the Cap'n Web session is closed and all proxies are
_poisoned_. Once a proxy is poisoned, it cannot be used, and must be recreated.
