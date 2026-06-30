---
"miniflare": minor
---

Proxy service binding RPC calls through capnweb

Miniflare now proxies Worker service binding RPC calls through capnweb from Node.js. This improves support for JSRPC features like callbacks and returned `RpcTarget` stubs, while keeping `fetch()` and legacy binding APIs on the existing proxy path. This can be disabled with `unsafeCapnwebRpcProxy: false`.
