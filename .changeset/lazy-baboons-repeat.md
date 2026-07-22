---
"miniflare": patch
---

Honour `fit`, `gravity` and `background` in the local Images binding

The local simulator for `env.IMAGES` resized every transform with sharp's `fit: "contain"` regardless of the options passed to `.transform()`, so `fit`, `gravity` and `background` had no effect in local development while the deployed binding honoured them. sharp's `"contain"` also pads to the exact target dimensions, so any image whose aspect ratio did not match the requested `width`x`height` came back letterboxed with black bars baked into the pixels.

The binding now resolves those options through the same mapping the `cf.image` simulator already uses: `fit` defaults to `scale-down`, `pad` pads with white unless a `background` is given, and `gravity` selects the crop position.
