---
"miniflare": patch
---

Match `Content-Type` case-insensitively when simulating Cloudflare's response compression

Locally, responses were only compressed when the `Content-Type` matched the compressible media type list exactly. Because HTTP media types are case-insensitive and may carry whitespace before their parameters, headers such as `Application/JSON` or `text/html ; charset=utf-8` were treated as non-compressible, diverging from production behaviour. The media type is now trimmed and lowercased before matching.
