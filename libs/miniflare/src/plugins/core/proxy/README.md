# Miniflare API Proxy

Miniflare provides methods for accessing bindings from Node.js, outside a
`workerd` process. These are implemented by an API proxy that proxies accesses
and calls to properties and methods over HTTP calls. The directory implements
the client for this. The server is implemented as a Durable Object in
[`src/workers/core/proxy.worker.ts`](../../../workers/core/proxy.worker.ts).

Using a Durable Object allows us to share references containing I/O objects like
streams across requests. The Durable Object contains a "heap", mapping addresses
to references. The "heap" is initialised with `globalThis` and `env`.

The proxy client builds proxies for each object on the heap. Accessing a
property on a proxy will result in a synchronous `GET` operation to the proxy
server. If the property is not a method, the value will be serialised back to
the client. Note this may involve putting more references on the "heap".

If the property is a method, the client will return a function from the access.
Future accesses to the same property key will return the same function without
the synchronous `GET` operation. Calling this function will serialise all the
arguments, then perform a synchronous `CALL` operation on the target, and the
return value will be serialised back to the client. If this function returns a
`Promise`, it will be stored on the "heap", and a reference returned. An
asynchronous `GET` operation will then be performed to resolve the `Promise`,
and serialise the result. If a function returns a `Promise` once, all future
calls will send asynchronous `CALL` operations instead, that resolve the
`Promise` without an additional round trip.

If the function call had `ReadableStream` arguments, the first will be sent
unbuffered after the rest of the arguments. All function calls with
`ReadableStream` or `Blob` arguments are assumed to be asynchronous. This
assumption is required as synchronous operations block the main thread and
prevent chunks from `ReadableStream`s being read.

If the function call threw, or returned a `Promise` that rejected, the error
will be serialised and re-thrown/rejected in the client. Note that the stack
trace will be updated to reflect the calling location in the client, not the
server.

To prevent unbounded growth of the "heap", all proxies are registered with a
`FinalizationRegistry`. When the proxy is garbage collected, a `FREE` operation
will remove the corresponding "heap" entry allowing it to be garbage collected
on the server too.

When `workerd` is restarted with `Miniflare#setOptions()` or stopped with
`Miniflare#dispose()`, all proxies are _poisoned_. Once a proxy is poisoned, it
cannot be used, and must be recreated. Poisoned proxies are unregistered from
the `FinalizationRegistry` too, as the addresses they point too will be invalid
and shouldn't be freed again.
