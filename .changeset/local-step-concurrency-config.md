---
"miniflare": patch
"@cloudflare/workflows-shared": patch
---

Accept step concurrency keys in local Workflows

`step.do()` calls with a `concurrency` key no longer fail with an invalid step config error in local development, matching the deployed engine. A step that lists the same key twice now fails with the same error as in production.
