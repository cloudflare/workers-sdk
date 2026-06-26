---
"miniflare": minor
---

Add an unsafe capnweb-backed RPC proxy option

Miniflare now supports `unsafeCapnwebRpcProxy` for proxying Worker service binding RPC calls through capnweb from Node.js. This improves support for JSRPC features like callbacks and returned `RpcTarget` stubs, while keeping `fetch()` and legacy binding APIs on the existing proxy path.
