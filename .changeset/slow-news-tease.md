---
"wrangler": patch
---

fix: add `fetch()` dev helper correctly for pnp style package managers

In https://github.com/cloudflare/wrangler2/pull/992, we added a dev-only helper that would warn when using `fetch()` in a manner that wouldn't work as expected (because of a bug we currently have in the runtime). We did this by injecting a file that would override usages of `fetch()`. When using pnp style package managers like yarn, this file can't be resolved correctly. So to fix that, we extract it into the temporary destination directory that we use to build the worker (much like a similar fix we did in https://github.com/cloudflare/wrangler2/pull/1154)

Reported at https://github.com/cloudflare/wrangler2/issues/1320#issuecomment-1188804668
