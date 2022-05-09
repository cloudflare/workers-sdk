---
"wrangler": patch
---

fix: log proper response status codes in `dev`

During `dev` we log the method/url/statuscode for every req+res. This fix logs the correct details for every request.

Fixes https://github.com/cloudflare/wrangler2/issues/931
