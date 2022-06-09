---
"wrangler": patch
---

fix: ensure wrangler init works with older versions of git

Rather than using the recently added `--initial-branch` option, we now just renamed the initial branch using `git branch -m main`.

Fixes https://github.com/cloudflare/wrangler2/issues/1168
