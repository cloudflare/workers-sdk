---
"@cloudflare/workers-shared": patch
---

Update mime dependency to 4.X so that javascript files will have content types of `text/javascript` instead of `application/javascript`. This will affect the content-types computed by Asset Worker within Workers Static Assets.
