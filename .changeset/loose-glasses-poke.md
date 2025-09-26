---
"miniflare": patch
---

Loosen validation around different configurations for Durable Object

Allow durable objects to have `enableSql`, `unsafeUniqueKey` and `unsafePreventEviction` configurations set to `undefined` even if they same durable objects are defined with those configurations set to a different value (this would allow workers using external durable objects not to have to duplicate such configurations in their options)
