---
"@cloudflare/workers-utils": patch
---

Reject Windows drive prefixes when converting file paths to URL paths

`toUrlPath()` now throws for drive-prefixed paths as documented. Previously it used `console.assert()`, which only logged the invalid input and returned a path containing the drive prefix.
