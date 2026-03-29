---
"wrangler": patch
---

Allow `wrangler dev` to start when the assets directory does not exist yet

Previously, `wrangler dev` would throw a `NonExistentAssetsDirError` and refuse to start if the configured assets directory was absent on disk. This was a problem for projects where the assets directory is a build output (e.g. `dist/`) that hasn't been generated yet when the dev server first starts.

Now, local dev commands (`wrangler dev`, `getPlatformProxy`, `unstable_getMiniflareWorkerOptions`) skip the directory-existence check and start up with zero assets. Once the build runs and populates the directory, the file watcher triggers a reload and assets are served normally. The existence check is still enforced for `wrangler deploy`, `wrangler versions upload`, and `wrangler triggers deploy`, where a missing directory is always an error.
