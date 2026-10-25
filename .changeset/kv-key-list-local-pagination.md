---
"wrangler": patch
---

Fix `kv key list` returning only the first 1000 keys in local mode

Listing a local namespace with more than 1000 keys stopped after the first 1000 without any warning, so the output looked complete when it wasn't. `kv key list` now returns every key in local mode, with or without `--prefix`.
