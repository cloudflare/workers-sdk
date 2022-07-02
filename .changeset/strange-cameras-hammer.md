---
"wrangler": patch
---

fix: keep site upload batches under 98 mb

The maximum _request_ size for a batch upload is 100 MB. We were previously calculating the upload key value to be under _100 MiB_. Further, with a few bytes here and there, the size of the request can exceed 100 MiB. So this fix calculate using MB instead of MiB, but also brings down our own limit to 98 MB so there's some wiggle room for uploads.

Fixes https://github.com/cloudflare/wrangler2/issues/1367
