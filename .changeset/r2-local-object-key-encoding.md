---
"wrangler": patch
---

Fix `r2 object put` and `r2 bulk put` storing a different key in local mode

Keys that are not URL-safe were mangled on the way into local storage. A key with a space or a non-ASCII character was stored under its percent-encoded name, so a later `r2 object get` for that key reported that the key does not exist. Two keys that differ only after a `#` collapsed into a single object, and the second upload replaced the first. A key with a `%` that is not a valid escape failed outright with "Invalid URL string.", and one with a valid escape, such as `%41.txt`, was stored as `A.txt`. Spaces, non-ASCII characters, `#` and `%` now survive the trip into local storage. Remote writes were never affected, and objects already in local state are left where they are.
