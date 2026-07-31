---
"miniflare": patch
---

fix: normalize Content-Type case and whitespace when determining compression eligibility

`isCompressedByCloudflareFL()` compared the Content-Type header against a lowercase
set without trimming whitespace or lowercasing the input first. Headers like
`Text/HTML` or `text/html ; charset=utf-8` (extra space before the `;`) were
treated as non-compressible even though Cloudflare's real edge compresses them,
causing local dev responses to diverge from production behavior.
