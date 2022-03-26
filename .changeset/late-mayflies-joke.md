---
"wrangler": patch
---

fix: trigger login flow if refreshtoken isn't valid

If the auth refresh token isn't valid, then we should trigger the login flow. Reported in https://github.com/cloudflare/wrangler2/issues/316
