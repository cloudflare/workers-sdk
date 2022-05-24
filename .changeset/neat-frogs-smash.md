---
"wrangler": patch
---

fix: delegate `wrangler build` to `wrangler publish`

Since `wrangler publish --dry-run --outdir=dist` is basically the same result
as what Wrangler 1 did with `wrangler build` let's run that for the user if
they try to run `wrangler build`.
