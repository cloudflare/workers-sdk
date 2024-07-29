# 📦 kv-r2-caches

This Worker makes use of KV and R2 bindings, along with the Cache API. The Worker accepts `GET`/`PUT` requests to `/kv/...` and `/r2/...`. Request URLs are used as keys. `PUT` requests store their body at the corresponding key. `GET` requests read the value at the key. R2 reads are cached using the Cache API.

| Test                                        | Overview                                    |
| ------------------------------------------- | ------------------------------------------- |
| [kv.test.ts](test/kv.test.ts)               | Integration tests for KV endpoints          |
| [r2.test.ts](test/r2.test.ts)               | Integration and unit tests for R2 endpoints |
| [isolation.test.ts](test/isolation.test.ts) | Illustrative example for isolated storage   |
