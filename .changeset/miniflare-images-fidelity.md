---
"miniflare": minor
---

Emit `Cf-Resized` error headers and support `quality`, `flip`, `blur`, and `sharpen` in local Images transforms

Miniflare's local `cf.image` handler now sets `Cf-Resized: err=<code>` when failing open to the source image (such as `err=9401` for invalid resize arguments, `err=9412` for non-image inputs, and `err=9520` for SVG inputs). Both `env.IMAGES` and `cf.image` local transforms also support `flip`, `blur`, and `sharpen`, and `env.IMAGES` honors `output({ quality })` (numeric values and named presets) while preserving chained `.transform()` order.
