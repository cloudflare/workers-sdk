---
"wrangler": patch
---

fix: persist dev experimental storage state in feature specific dirs

With `--experimental-enable-local-persistence` in `dev`, we were clobbering a single folder with data from kv/do/cache. This patch gives individual folders for them. It also enables persistence even when this is not true, but that stays only for the length of a session, and cleans itself up when the dev session ends.

Fixes https://github.com/cloudflare/wrangler2/issues/830
