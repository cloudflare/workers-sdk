---
"wrangler": patch
---

fix: do not crash in wrangler dev when passing a request object to fetch

This reverts and fixes the changes in https://github.com/cloudflare/wrangler2/pull/1769
which does not support creating requests from requests whose bodies have already been consumed.

Fixes #2562
