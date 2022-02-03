---
"wrangler": patch
---

feat: `wrangler init` offers to create a starter worker

We got feedback that `wrangler init` felt incomplete, because the immediate next thing folks need is a starter source file. So this adds another step to `wrangler init` where we offer to create that file for you.

Fixes https://github.com/cloudflare/wrangler2/issues/355
