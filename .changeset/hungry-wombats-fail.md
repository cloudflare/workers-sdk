---
"wrangler": patch
---

feat: add `--text` flag to decode `kv:key get` response values as utf8 strings

Previously, all kv values were being rendered directly as bytes to the stdout, which makes sense if the value is a binary blob that you are going to pipe into a file, but doesn't make sense if the value is a simple string.

resolves #1306
