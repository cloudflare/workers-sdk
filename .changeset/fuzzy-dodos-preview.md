---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Send exports with Worker Preview deployments

`wrangler preview` dropped the `exports` block from deployment requests. Durable Objects reached through `ctx.exports` had no Preview namespace, and cache settings for each entrypoint were lost too.
