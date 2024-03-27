---
"miniflare": patch
---

fix: make sure the magic proxy can handle multiple parallel r2 stream reads

currently trying to read multiple R2 streams in parallel (via `Promise.all` for example)
generates a deadlock which prevents any of the target streams to be read, this is caused
by the magic proxy underlying implementation only allowing a single HTTP connection to the
workerd process at a time. Fix such issue by instead allowing any number of parallel HTTP
connections at the same time.
