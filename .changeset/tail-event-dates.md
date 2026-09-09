---
"@cloudflare/vite-plugin": patch
"miniflare": patch
---

Restore `Date` and `bigint` values on tail events forwarded to a tail consumer in local dev

Tail events are serialized to JSON before being handed to a tail consumer running in another local dev session. `Date` values were flattened to ISO strings on the way through, so a consumer received `event.scheduledTime` as a string and calls such as `event.scheduledTime.getTime()` threw locally while working in production. They are now restored as `Date` objects, matching production.

A `bigint` was worse than lossy in the Vite plugin: `JSON.stringify()` throws on one rather than dropping it, so a single tail event carrying a `bigint` took out the whole forwarding call with `TypeError: Do not know how to serialize a BigInt`. This is reachable today, because `TraceDiagnosticChannelEvent.message` is typed `any` and preserves whatever a worker publishes — `channel("test").publish(5n)` is enough. Miniflare already tagged `bigint` values; the Vite plugin's copy of the same helper did not, and now does.
