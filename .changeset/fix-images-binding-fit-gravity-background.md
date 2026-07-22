---
"miniflare": patch
---

Fix the local Images binding transform (`env.IMAGES.input(...).transform(...)`) ignoring `fit`, `gravity`, and `background`. The resize call previously hardcoded sharp's `fit: "contain"` for every transform, which letterboxes the output with black bars regardless of what was requested. `fit`, `gravity`, and `background` are now forwarded to sharp using the same resolution logic already used for `cf.image` fetch subrequests, and an unspecified `fit` now matches production's non-padding default instead of always letterboxing.
