---
"miniflare": minor
---

`listDurableObjectIds()` takes the class name the Worker exports, not a binding name

Pass the Durable Object class and the Worker that exports it, as in `mf.listDurableObjectIds("Counter", "my-worker")`. This is a breaking change to the beta API: a binding name now throws `No Durable Object class named …`.
