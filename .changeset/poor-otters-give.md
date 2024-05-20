---
"wrangler": patch
---

fix: `wrangler pages deploy` should fail if deployment was unsuccessful

If a Pages project fails to deploy, `wrangler pages deploy` will log
an error message, but exit successfully. It should instead throw a
`FatalError`.
