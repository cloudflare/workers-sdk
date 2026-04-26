---
"wrangler": patch
---

Allow `getPlatformProxy` and `unstable_getMiniflareWorkerOptions` to start when the assets directory does not exist yet

Previously, `getPlatformProxy` would catch and swallow `NonExistentAssetsDirError` internally when the configured assets directory was absent on disk. This has been refactored so that the directory-existence check is skipped entirely for `getPlatformProxy` and `unstable_getMiniflareWorkerOptions`, since these APIs are typically used at dev time in frameworks where the assets directory is a build output that may not exist yet.

`wrangler dev`, `wrangler deploy`, `wrangler versions upload`, and `wrangler triggers deploy` continue to require the assets directory to exist when specified.
