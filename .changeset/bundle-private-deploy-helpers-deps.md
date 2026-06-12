---
"@cloudflare/deploy-helpers": patch
---

Bundle private internal dependencies in deploy helpers

`@cloudflare/deploy-helpers` no longer declares private workspace packages as runtime dependencies, so installing the package from npm does not require unpublished internal packages.
