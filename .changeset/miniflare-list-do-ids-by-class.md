---
"miniflare": minor
---

List Durable Object IDs by the class the Worker exports

`listDurableObjectIds()` now takes the Durable Object class and the Worker that exports it, as in `mf.listDurableObjectIds("Counter", "my-worker")`. This is a breaking change in v5 beta: a binding name now throws `No Durable Object class named …`, unless the Worker also exports a class with that name, in which case that class's IDs are listed.
