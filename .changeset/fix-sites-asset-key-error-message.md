---
"wrangler": patch
---

Fix stray characters in the Workers Sites asset-key-too-long error

The error thrown when an asset path key exceeds the 512-character limit ended with a stray `",` copy-paste artifact, so the message printed to users terminated with `...#kv-limits",` and the trailing documentation URL was malformed. The message now ends cleanly at the URL.
