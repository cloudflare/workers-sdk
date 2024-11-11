---
"wrangler": minor
---

Add `workers_dev_previews` toggle to `wrangler.toml`

The current Preview URLs (beta) feature routes to version preview urls based on the status of the `workers_dev` config value. Beta users have requested the ability to enable deployment urls and preview urls separately on `workers.dev`, and the new `previews_enabled` field of the enable-subdomain API will allow that. This change separates the `workers_dev` and `workers_dev_previews` behavior during `wrangler triggers deploy` and `wrangler versions upload`. `wrangler_dev_previews` defaults to true, and does not implicitly depend on routes the way `wrangler_dev` does.
