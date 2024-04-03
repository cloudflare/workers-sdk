---
"miniflare": patch
---

fix: make sure the magic proxy can handle multiple parallel r2 stream reads

Currently trying to read multiple R2 streams in parallel (via `Promise.all` for example) leads to deadlock which prevents any of the target streams from being read. This is caused by the underlying implementation only allowing a single HTTP connection to the Workers runtime at a time. This change fixes the issue by allowing multiple parallel HTTP connections.
