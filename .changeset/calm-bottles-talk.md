---
"wrangler": patch
---

fix: remove timeout on custom builds, and make sure logs are visible

This removes the timeout we have for custom builds. We shouldn't be applying this timeout anyway, since it doesn't block wrangler, just the user themselves. Further, in https://github.com/cloudflare/wrangler2/pull/759, we changed the custom build's process stdout/stderr config to "pipe" to pass tests, however that meant we wouldn't see logs in the terminal anymore. This patch removes the timeout, and brings back proper logging for custom builds.
