---
"miniflare": patch
"wrangler": patch
---

Quieter builds

This patch cleans up warnings we were seeing when doing a full build. Specifically:

- fixtures/remix-pages-app had a bunch of warnings about impending features that it should be upgraded to, so I did that. (tbh this one needs a full upgrade of packages, but we'll get to that later when we're upgrading across the codebase)
- updated `@microsoft/api-extractor` so it didn't complain that it didn't match the `typescript` version (that we'd recently upgraded)
- it also silenced a bunch of warnings when exporting types from `wrangler`. We'll need to fix those, but we'll do that when we work on unstable_dev etc.
- workers-playground was complaining about the size of the bundle being generated, so I increased the limit on it
