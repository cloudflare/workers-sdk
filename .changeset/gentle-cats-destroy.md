---
"wrangler": patch
---

polish: don't log all errors when logging in

This removes a couple of logs we had for literally every error in our oauth flow. We throw the error and handle it separately anyway, so this is a safe cleanup.

Fixes https://github.com/cloudflare/wrangler2/issues/788
