---
"wrangler": patch
---

fix: read `process.env.NODE_ENV` correctly when building worker

We replace `process.env.NODE_ENV` in workers with the value of the environment variable. However, we have a bug where when we make an actual build of wrangler (which has NODE_ENV set as "production"), we were also replacing the expression where we'd replace it in a worker. The result was that all workers would have `process.env.NODE_ENV` set to production, no matter what the user had set. The fix here is to use a "dynamic" value for the expression so that our build system doesn't replace it.

Fixes https://github.com/cloudflare/wrangler2/issues/1477
