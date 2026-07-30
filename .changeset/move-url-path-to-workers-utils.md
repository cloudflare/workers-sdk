---
"@cloudflare/workers-utils": minor
---

Add `toUrlPath` and `UrlPath` exports

`toUrlPath(filePath)` converts a file-system path into a URL-safe path by replacing backslashes with forward slashes and rejecting Windows drive-letter prefixes (e.g. `C:`). `UrlPath` is the branded string type it returns, letting callers prove at the type level that a string has been normalized for use in URLs.
