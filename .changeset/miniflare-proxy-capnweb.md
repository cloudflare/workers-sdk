---
"miniflare": patch
---

Support promise pipelining and callbacks in Workers RPC calls from `getPlatformProxy()` and `getBindings()`

Service bindings (including bindings implemented as services, such as Secrets Store and Flagship), Durable Object stubs, and the `RpcTarget`s and functions they return now behave like Workers RPC from Node.js: calls can be pipelined, functions can be passed as callbacks, and calls and properties return promises that must be awaited. These calls no longer block the Node.js main thread. `Map`, `Set`, `RegExp` and `File` values can't be sent over these calls, and object keys like `constructor` are dropped.
