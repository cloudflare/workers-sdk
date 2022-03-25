---
"wrangler": patch
---

fix: do not deploy to workers.dev when routes are defined in an environment

When `workers_dev` is not configured, we had a bug where it would default to true inside an environment even when there were routes defined, thus publishing both to a `workers.dev` subdomain as well as the defined routes. The fix is to default `workers_dev` to `undefined`, and check when publishing whether or not to publish to `workers.dev`/defined routes.

Fixes https://github.com/cloudflare/wrangler2/issues/690
