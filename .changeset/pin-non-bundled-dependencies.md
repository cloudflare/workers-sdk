---
"wrangler": patch
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/workers-editor-shared": patch
"@cloudflare/cli-shared-helpers": patch
---

Pin non-bundled runtime dependencies to exact versions

Dependencies that are not bundled into a package's published output are installed directly into consumers' dependency trees, so they are now pinned to exact versions instead of semver ranges. This closes a supply-chain gap where an unpinned external dependency could resolve to a compromised upstream release on a fresh install. A new `pnpm check:pinned-deps` lint enforces this for all published packages (and for the shared pnpm catalog) going forward.
