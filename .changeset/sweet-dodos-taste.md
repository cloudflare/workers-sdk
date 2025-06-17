---
"miniflare": patch
---

fix: streamed response bodies in Miniflare should not infer compression encoding by default

When serving responses that have not defined `content-encoding` explicitly, Miniflare was attempting to infer a compression algorithm from the `accept-encoding` request header.
This resulted in streamed responses being compressed with an algorithm (usually gzip) that does not stream as expected:
The compression buffer is big enough that it rarely flushes giving the impression that the response is not streaming

Now Miniflare will prefer to infer the `identity` `content-encoding` response from the `accept-encoding` request header if possible.
Therefore unless the accept-headers explicitly disallow `identity`, streamed responses will not be compressed by default.
