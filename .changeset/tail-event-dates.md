---
"@cloudflare/vite-plugin": patch
"miniflare": patch
---

Restore `Date` values on tail events forwarded to a tail consumer in local dev

Tail events are serialized to JSON before being handed to a tail consumer running in another local dev session. `Date` values were flattened to ISO strings on the way through, so a consumer received `event.scheduledTime` as a string and calls such as `event.scheduledTime.getTime()` threw locally while working in production. They are now restored as `Date` objects, matching production.
