---
"miniflare": patch
---

Reduce `dispatchFetch()` connection exhaustion under sustained local and CI workloads

Repeated dispatches now reuse runtime connections for all HTTP methods, including `POST`, `PUT`, `DELETE`, and `PATCH`, instead of creating a new connection for every request. This prevents read-heavy and write-heavy Miniflare test suites from exhausting the host's available ephemeral ports. Transport failures are surfaced without automatically replaying requests, since Worker handlers can have side effects even for `GET` and `HEAD`.
