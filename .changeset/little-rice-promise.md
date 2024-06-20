---
"wrangler": minor
---

feat: add `wrangler versions secret put`, `wrangler versions secret bulk` and `wrangler versions secret list`

`wrangler versions secret put` allows for you to add/update a secret even if the latest version is not fully deployed. A new version with this secret will be created, the existing secrets and config are copied from the latest version.

`wrangler versions secret bulk` allows you to bulk add/update multiple secrets at once, this behaves the same as `secret put` and will only make one new version.

`wrangler versions secret list` lists the secrets available to the currently deployed versions. `wrangler versions secret list --latest-version` or `wrangler secret list` will list for the latest version.

Additionally, we will now prompt for extra confirmation if attempting to rollback to a version with different secrets than the currently deployed.
