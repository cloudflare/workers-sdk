---
"wrangler": patch
---

fix: generate site assets manifest relative to `site.bucket`

We had a bug where we were generating asset manifest keys incorrectly if we ran wrangler from a different path to `wrangler.toml`. This fixes the generation of said keys, and adds a test for it.

Fixes #1235
