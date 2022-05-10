---
"wrangler": patch
---

fix: look for an alternate port in the dev command if the configured one is in use

Previously, we were only calling `getPort()` if the configured port was undefined.
But since we were setting the default for this during validation, it was never undefined.

Fixes [#949](https://github.com/cloudflare/wrangler2/issues/949)
