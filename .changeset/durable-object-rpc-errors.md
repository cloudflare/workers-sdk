---
"miniflare": patch
---

Fix errors thrown by Durable Object RPC methods called through `getBindings()`

The call used to fail with an internal `AssertionError` instead of the method's own error, which is now thrown.
