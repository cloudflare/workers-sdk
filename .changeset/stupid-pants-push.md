---
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/kv-asset-handler": patch
"miniflare": patch
---

Bundle more third-party dependencies to reduce supply chain risk

Previously, several small utility packages were listed as runtime dependencies and
installed separately. These are now bundled directly into the published packages,
reducing the number of external dependencies users need to trust.

Bundled dependencies:

- **miniflare**: `acorn`, `acorn-walk`, `exit-hook`, `glob-to-regexp`, `stoppable`
- **kv-asset-handler**: `mime`
- **vite-plugin-cloudflare**: `@remix-run/node-fetch-server`, `defu`, `get-port`, `picocolors`, `tinyglobby`
- **vitest-pool-workers**: `birpc`, `devalue`, `get-port`, `semver`
