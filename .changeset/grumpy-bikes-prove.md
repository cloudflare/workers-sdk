---
"wrangler": patch
---

fix: use account id for listing zones

Fixes https://github.com/cloudflare/workers-sdk/issues/4944

Trying to fetch `/zones` fails when it spans more than 500 zones. The fix to use an account id when doing so. This patch passes the account id to the zones call, threading it through all the functions that require it.
