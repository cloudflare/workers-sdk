---
"wrangler": patch
---

fix: publish environment specific routes

This adds some tests for publishing routes, and fixes a couple of bugs with the flow.

- fixes publishing environment specific routes, closes https://github.com/cloudflare/wrangler2/issues/513
- default `workers_dev` to `false` if there are any routes specified
- catches a hanging promise when we were toggling off a `workers.dev` subdomain (which should have been caught by the `no-floating-promises` lint rule, so that's concerning)
- this also fixes publishing environment specific crons, but I'll write tests for that when I'm doing that feature in depth
