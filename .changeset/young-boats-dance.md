---
"wrangler": patch
---

fix: cleanup after `pages dev` tests

We weren't killing the process started by wrangler whenever its parent was killed. This fix is to listen on SIGINT/SIGTERM and kill that process. I also did some minor configuration cleanups.

Fixes https://github.com/cloudflare/wrangler2/issues/397
Fixes https://github.com/cloudflare/wrangler2/issues/618
