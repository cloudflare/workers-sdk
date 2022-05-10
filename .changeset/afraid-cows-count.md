---
"wrangler": patch
---

fix: don't crash during `init` if `git` is not installed

When a command isn't available on a system, calling `execa()` on it throws an error, and not just a non zero exitCode. This patch fixes the flow so we don't crash the whole process when that happens on testing the presence of `git` when calling `wrangler init`.

Fixes https://github.com/cloudflare/wrangler2/issues/950
