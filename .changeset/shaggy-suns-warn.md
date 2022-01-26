---
"wrangler": patch
---

fix: remove `--prefer-offline` when running `npm install`

We were using `--prefer-offline` when running `npm install` during `wrangler init`. The behaviour is odd, it doesn't seem to fetch from the remote when the cache isn't hit, which is not what I'm expecting. So we remove `--prefer-offline`.
