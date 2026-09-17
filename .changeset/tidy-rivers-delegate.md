---
"@cloudflare/autoconfig": patch
---

Defer configured unsupported frameworks to an installed Cloudflare dev server

Configured `cf` projects whose detected framework is not supported by autoconfig no longer run inferred package scripts: `npm run build` as these may be invalid, e.g a build script `cf build` causes recursive calls `cf build -> npm run build -> cf build`. This allows `cf` to use its existing Cloudflare dev-server delegation instead.
