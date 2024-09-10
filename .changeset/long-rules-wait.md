---
"wrangler": minor
---

feat: support analytics engine in local/remote dev

This adds "support" for analytics engine datasets for `wrangler dev`. Specifically, it simply mocks the AE bindings so that they exist while developing (and don't throw when accessed).

This does NOT add support in Pages, though we very well could do so in a similar way in a followup.
