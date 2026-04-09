---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
---

feat: add Flagship feature flag binding support

Adds end-to-end support for the Flagship feature flag binding, which allows Workers to evaluate feature flags from Cloudflare's Flagship service. Configure it in `wrangler.json` with a `flagship` array containing `binding` and `app_id` entries. In local dev, the binding returns default values for all flag evaluations; use `"remote": true` in the binding to evaluate flags against the live Flagship service.
