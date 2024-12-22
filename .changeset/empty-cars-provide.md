---
"@cloudflare/workers-shared": patch
---

fix: resolves an issue where a malformed path such as `https://example.com/%A0` would cause an unhandled error
