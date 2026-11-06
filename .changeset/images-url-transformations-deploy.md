---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Apply `images.url_transformations` when deploying a Worker

`wrangler deploy` and `wrangler versions deploy` now apply the `images.url_transformations` setting to the deployed Worker. If the setting can't be applied, the command fails after the Worker has been deployed, and can be re-run to retry. Removing `url_transformations` from the configuration leaves the Worker's existing setting in place.

The setting isn't applied for `--dry-run`, `wrangler versions upload`, or Workers deployed to a dispatch namespace.
