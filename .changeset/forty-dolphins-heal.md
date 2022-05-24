---
"wrangler": patch
---

fix: ensure all line endings are normalized before parsing as TOML

Only the last line-ending was being normalized not all of them.

Fixes https://github.com/cloudflare/wrangler2/issues/1094
