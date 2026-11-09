---
"miniflare": patch
---

Remove the empty placeholder directory Miniflare creates when `assets.directory` doesn't exist yet

Previously each process left an empty `miniflare-assets-*` directory in the system temp directory, which built up over many runs from fresh checkouts or before a first build. The placeholder now lives inside the instance's own temporary directory, so `dispose()` and process exit remove it.
