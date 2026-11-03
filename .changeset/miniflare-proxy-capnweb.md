---
"miniflare": patch
---

Use Cap'n Web for Workers RPC calls made through `getBindings()` and `getPlatformProxy()`

Service bindings, Durable Object stubs, and the `RpcTarget`s and functions they return now behave like Workers RPC from Node.js: calls can be pipelined, functions can be passed as callbacks, and properties must be awaited. These calls, and calls to async methods of other bindings, no longer block the Node.js main thread. Blocking is now limited to synchronous APIs, such as `DurableObjectNamespace#idFromName()` and `R2Object` properties.
