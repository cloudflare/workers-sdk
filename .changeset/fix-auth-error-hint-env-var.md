---
"wrangler": patch
---

fix: show actionable hint when `/memberships` returns a bad-credentials error (code 9106)

Previously, `wrangler` threw a raw Cloudflare API error ("Missing X-Auth-Key, X-Auth-Email or Authorization headers") with no guidance. Now it emits a `UserError` explaining that an environment variable such as `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, or `CLOUDFLARE_EMAIL` may be set to an invalid value, and suggests running `wrangler logout` / `wrangler login` to re-authenticate.
