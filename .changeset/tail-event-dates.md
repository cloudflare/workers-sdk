---
"@cloudflare/vite-plugin": patch
"miniflare": patch
---

Keep `Date` and `bigint` values on tail events forwarded to a tail consumer in local dev

A tail consumer running in another local dev session received `Date` values such as `event.scheduledTime` as strings, so calls like `event.scheduledTime.getTime()` threw locally while working in production. They now arrive as `Date` objects. In the Vite plugin, a tail event carrying a `bigint` (for example a `bigint` published on a diagnostics channel) no longer fails the whole forwarding call.
