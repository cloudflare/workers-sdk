---
"wrangler": patch
---

fix: Don't check expiry dates on custom certs

Fixes https://github.com/cloudflare/workers-sdk/issues/5964

For `wrangler dev`, we don't have to check whether certificates have expired when they're provided by the user.
