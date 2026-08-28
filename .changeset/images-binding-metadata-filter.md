---
"miniflare": minor
---

Support the `filter.metadata` option on `env.IMAGES.hosted.list()` in local development, matching the metadata filtering behaviour of the production Images binding. Filters support the `eq` (implicit for bare values), `in`, `gt`, `gte`, `lt`, and `lte` operators, dot-notation nested field paths, and AND logic across multiple fields.
