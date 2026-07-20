---
"@cloudflare/vitest-pool-workers": patch
---

Fix a runtime start-up failure ("No such module \"cloudflare:test-internal\"") when the project workspace path contains non-ASCII characters (e.g. CJK characters) on Windows. The module fallback service's redirect response set the target file path directly as an HTTP `Location` header value, but headers are restricted to the Latin-1/ASCII byte range, so any non-ASCII byte in the path caused header construction to throw. Such paths are now percent-encoded (and tagged with a sentinel prefix) before being used as a header value, and decoded again only for the values we encoded, so the round-trip is unambiguous and a workspace path containing a literal `%` is left untouched instead of being mis-decoded.
