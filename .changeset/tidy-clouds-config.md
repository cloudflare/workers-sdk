---
"@cloudflare/deploy-helpers": minor
---

Expose Cloudflare config conversion utilities from deploy helpers

`@cloudflare/deploy-helpers` now re-exports `ConfigSchema` and `convertToWranglerConfig` from the internal `@cloudflare/config` package, so consumers can parse and convert Cloudflare config files without depending on the unpublished package directly.
