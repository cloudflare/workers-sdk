---
"wrangler": patch
---

fix: prevent local mode restart

In dev, we inject a patch for `fetch()` to detect bad usages. This patch is copied into the destination directory before it's used. esbuild appears to have a bug where it thinks a dependency has changed so it restarts once in local mode. The fix here is to copy the file to inject into a separate temporary dir.

Fixes https://github.com/cloudflare/wrangler2/issues/1515
