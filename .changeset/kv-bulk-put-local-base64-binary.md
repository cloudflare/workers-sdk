---
"wrangler": patch
---

Fixes `kv bulk put` corrupting binary values written to local KV

Values marked `base64: true` were stored incorrectly whenever they contained bytes that do not form valid UTF-8, which covers images, compressed data and most other binary payloads. A Worker reading such a key back under `wrangler dev` got a different, longer value than the one that was written: a 12 byte PNG header came back as 20 bytes.

`kv bulk put` writes to local KV by default, so the plain command was the affected one. Remote writes were never affected, and neither were entries without `base64` or values written with `kv key put`.
