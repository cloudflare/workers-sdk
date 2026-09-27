---
"miniflare": patch
---

Preserve the request body length in `Miniflare#dispatchFetch()`

Previously, a request with a known-length body (e.g. a string) was sent to the Worker chunked, without a `Content-Length`. Passing its `request.body` to `R2Bucket#put()` then failed with "Provided readable stream must have a known length", even though the same request works in production. The body's length is now preserved.
