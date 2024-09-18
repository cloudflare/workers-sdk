---
"wrangler": patch
---

fix: ability to build tricky Node.js compat scenario Workers

Adds support for non-default build conditions and platform via the WRANGLER_BUILD_CONDITIONS and WRANGLER_BUILD_PLATFORM flags.

Fixes https://github.com/cloudflare/workers-sdk/issues/6742
