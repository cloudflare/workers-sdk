---
"miniflare": patch
---

Fix the local Images binding transform (`env.IMAGES.input(...).transform(...)`) ignoring the `fit`, `gravity`, and `background` options. Previously, local dev always letterboxed transformed images with black bars regardless of the options passed in. Local dev now respects `fit`, `gravity`, and `background`, matching production Images binding behavior.
