---
"wrangler": patch
---

fix: toggle `workers.dev` subdomains only when required

This fix -

- passes the correct query param to check whether a workers.dev subdomain has already been published/enabled
- thus enabling it only when it's not been enabled
- it also disables it only when it's explicitly knows it's already been enabled

The effect of this is that publishes are much faster.
