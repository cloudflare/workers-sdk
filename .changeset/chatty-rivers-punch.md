---
"miniflare": patch
"wrangler": patch
---

Fix AI Search binding failing over RPC in local dev

The AI Search binding uses an RPC-based protocol, but its raw workerd binding has a non-standard prototype that capnp-over-RPC classifies as "unsupported", causing `wrangler dev` to fail with "RPC stub points at a non-serializable type". The binding is now wrapped in a plain object that delegates only the allowed RPC methods (`aiSearch`), giving the serializer a target it can handle. A new `MF-Binding-Type` parameter is threaded from the miniflare AI plugin so the wrapping only applies to actual AI bindings, not other service bindings that happen to share method names.
