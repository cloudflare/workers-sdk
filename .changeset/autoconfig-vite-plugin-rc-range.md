---
"@cloudflare/autoconfig": patch
---

Install the Vite plugin release candidate when configuring projects for `cf`

Configuring a Vite project for `cf` now installs `@cloudflare/vite-plugin@^2.0.0-rc.0` instead of `^2.0.0-beta.v.0`, so an existing lockfile can't keep a beta that doesn't support the generated configuration.
