---
"miniflare": patch
---

Fix passing an `R2ObjectBody#body` back to `R2Bucket#put()` via `Miniflare#getR2Bucket()`

Previously, a body returned by `get()` lost its length on the way back through the binding proxy, so `put()` rejected it with "Provided readable stream must have a known length", even though the same call works in a Worker. The proxy now forwards the stream's length and the body streams straight through without buffering.
