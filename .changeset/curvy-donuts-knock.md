---
"wrangler": patch
---

fix: instruct api to exclude script content on worker upload

When we upload a script bundle, we get the actual content of the script back in the response. Sometimes that script can be large (depending on whether the upload was large), and currently it may even be a badly escaped string. We can pass a queryparam `excludeScript` that, as it implies, exclude the script content in the response. This fix does that.

Fixes https://github.com/cloudflare/wrangler2/issues/1222
