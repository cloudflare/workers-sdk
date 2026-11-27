---
"miniflare": minor
---

Improve local Images fidelity in Miniflare:
- Emit `Cf-Resized: err=<code>` headers when `cf.image` fails open to the source image (e.g. `err=9412` for non-image/decode failures, `err=9520` for SVG inputs), matching production error detection semantics.
- Wire `output({ quality })` on `env.IMAGES` local transforms and `flip`, `blur`, and `sharpen` on both `env.IMAGES` and `cf.image` local transforms.
