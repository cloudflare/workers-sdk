---
"wrangler": patch
---

fix: path should be optional for wrangler d1 backup download

This PR fixes a bug that forces folks to provide a `--output` flag to `wrangler d1 backup download`.
