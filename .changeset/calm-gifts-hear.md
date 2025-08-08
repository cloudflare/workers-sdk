---
"wrangler": patch
---

Ensure that `maybeStartOrUpdateRemoteProxySession` considers the potential account_id from the user's wrangler config

Currently if the user has an `account_id` in their wrangler config file, such id won't be taken into consideration for the remote proxy session, the changes here make sure that it is (note that the `auth` option of `maybeStartOrUpdateRemoteProxySession`, if provided, takes precedence over this id value).

The changes here also fix the same issue for `wrangler dev` and `getPlatformProxy` (since they use `maybeStartOrUpdateRemoteProxySession` under the hook).
