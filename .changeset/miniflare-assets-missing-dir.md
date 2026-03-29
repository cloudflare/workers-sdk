---
"miniflare": patch
---

Gracefully handle a missing assets directory by starting with zero assets

Previously, configuring Miniflare with an `assets.directory` that did not exist on disk would cause the asset services to fail to start. This is a common situation during `wrangler dev` when the assets directory is a build output that hasn't been generated yet.

Now, when the configured assets directory does not exist, Miniflare creates an empty temporary directory and starts the asset services with zero assets. Once the real directory is created and `setOptions()` is called (e.g. triggered by the file watcher), Miniflare reloads and begins serving the actual assets.
