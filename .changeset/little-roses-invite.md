---
"wrangler": patch
---

fix: disallow setting account_id in named service environments

Much like https://github.com/cloudflare/wrangler2/pull/641, we don't want to allow setting account_id with named service environments. This is so that we use the same account_id for multiple environments, and have them group together in the dashboard.
