---
"wrangler": minor
---

fix: use `zone_name` to determine a zone when the pattern is a custom hostname

In Cloudflare for SaaS, custom hostnames of third party domain owners can be used in Cloudflare.
Workers are allowed to intercept these requests based on the routes configuration.
Before this change, the same logic used by `wrangler dev` was used in `wrangler deploy`, which caused wrangler to fail with:

✘ [ERROR] Could not find zone for [partner-saas-domain.com]
