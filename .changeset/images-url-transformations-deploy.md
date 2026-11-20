---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Apply `images.url_transformations` when deploying a Worker

`wrangler deploy` and `wrangler versions deploy` now apply the `images.url_transformations` setting to the deployed Worker. The setting is applied after the Worker and its triggers have been deployed. If it can't be applied, the command fails with the reason from the API. Removing `url_transformations` from the configuration leaves the Worker's existing setting in place.

The setting isn't applied for `--dry-run`, `wrangler versions upload`, or Workers deployed to a dispatch namespace.
