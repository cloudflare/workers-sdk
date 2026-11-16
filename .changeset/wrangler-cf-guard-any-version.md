---
"wrangler": patch
---

Detect Cloudflare Build Output of any version before deploying

`wrangler deploy`, `wrangler versions upload` and `wrangler preview` refuse to run in a project that has Cloudflare Build Output, because that output belongs to `cf`. Detection now looks for any `.cloudflare/output/v<N>/` directory rather than only the root config of the current version, so output left by an older or newer `cf` is still caught.
