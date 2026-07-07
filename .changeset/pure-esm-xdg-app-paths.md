---
"@cloudflare/workers-utils": patch
"create-cloudflare": patch
"miniflare": patch
"wrangler": patch
---

Replace the CommonJS `xdg-app-paths` dependency with a vendored pure-ESM implementation

`xdg-app-paths` (and its `xdg-portable`/`os-paths` dependencies) are CommonJS only, which caused "Dynamic require of 'path' is not supported" errors when the surrounding code was bundled to ESM. The global config/cache directory resolution is now provided by a small, dependency-free pure-ESM module in `@cloudflare/workers-utils` that reproduces the previous path resolution exactly (verified against the real package in unit tests), so existing config and credential locations are unchanged. This also drops the transitive `fsevents` optional dependency that `xdg-app-paths` pulled in.

Miniflare and create-cloudflare now consume the shared helpers from `@cloudflare/workers-utils` instead of maintaining their own copies, importing node-only leaf entry points (`@cloudflare/workers-utils/fs-helpers`, `@cloudflare/workers-utils/global-wrangler-config-path`) where ESM bundling is required.
