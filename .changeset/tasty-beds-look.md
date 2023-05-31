---
"wrangler": patch
---

feature: add wrangler deploy option: --old-asset-ttl [seconds]

`wrangler deploy` immediately deletes assets that are no longer current, which has a side-effect for existing progressive web app users of seeing 404 errors as the app tries to access assets that no longer exist.

This new feature:
- does not change the default behavior of immediately deleting no-longer needed assets.
- allows users to opt-in to expiring newly obsoleted assets after the provided number of seconds hence, so that current users will have a time buffer before seeing 404 errors.
- is similar in concept to what was introduced in Wrangler 1.x with https://github.com/cloudflare/wrangler-legacy/pull/2221.
- is careful to avoid extension of existing expiration targets on already expiring old assets, which may have contributed to unexpectedly large KV storage accumulations (perhaps why, in Wrangler 1.x, the reversion https://github.com/cloudflare/wrangler-legacy/pull/2228 happened).
- no breaking changes for users relying on the default behavior, but some output changes exist when the new option is used, to indicate the change in behavior.