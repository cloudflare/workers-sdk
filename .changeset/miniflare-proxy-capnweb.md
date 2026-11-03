---
"miniflare": patch
---

Use Cap'n Web for Workers RPC calls made through `getBindings()` and `getPlatformProxy()`

Service bindings (including bindings implemented as services, such as Secrets Store and Flagship), Durable Object stubs, and the `RpcTarget`s and functions they return now behave like Workers RPC from Node.js: calls can be pipelined, functions can be passed as callbacks, and calls and properties return promises that must be awaited. These calls no longer block the Node.js main thread.
