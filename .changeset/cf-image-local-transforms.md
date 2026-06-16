---
"miniflare": minor
---

Support `cf.image` (transform via Workers) image transformations in local dev

`fetch(url, { cf: { image: { ... } } })` now transforms images locally via Sharp, instead of returning the original bytes unchanged. This mirrors the production "transform via Workers" feature, so Workers already using `cf.image` behave much more closely to production in `wrangler dev`.

As with the Images binding, `cf.image` transforms require Sharp to be installed — transforms are silently skipped if Sharp is unavailable.
