---
"@cloudflare/codemods": patch
---

Install the Vite plugin release candidate in `wrangler-to-cf`

The Wrangler-to-cf migration now installs `@cloudflare/vite-plugin@^2.0.0-rc.0` instead of the `beta` dist tag, which no longer receives new releases. It upgrades projects whose plugin is declared as a dist tag or resolves to a version older than the release candidate, since earlier betas don't support the generated configuration. The range also covers the stable v2 releases, so the migration no longer rewrites `package.json` to a dist tag after installing.
