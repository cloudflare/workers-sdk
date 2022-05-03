---
"wrangler": patch
---

fix: Stop unnecessarily amalgamating duplicate headers in Pages Functions

Previously, `set-cookie` mulitple headers would be combined because of unexpected behavior in [the spec](https://github.com/whatwg/fetch/pull/1346).
