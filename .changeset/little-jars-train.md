---
"miniflare": minor
---

Fix JOIN behaviour when selecting columns with the same name.

Properly handle the `resultsFormat` query that `workerd` sends. This fixes [the JOIN bug](https://github.com/cloudflare/workers-sdk/issues/3160) and makes the behaviour of `raw` consistent with the `workerd` behaviour.
