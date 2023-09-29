---
"wrangler": patch
---

fix: generate valid source maps with `wrangler pages dev` on macOS

On macOS, `wrangler pages dev` previously generated source maps with an
incorrect number of `../`s in relative paths. This change ensures paths are
always correct, improving support for breakpoint debugging.
