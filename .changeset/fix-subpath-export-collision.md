---
"@cloudflare/vitest-pool-workers": patch
---

Fix module fallback resolving bare specifiers to wrong subpath export

When a dependency has both an npm dependency and a subpath export with the same name (e.g. dependency `"some-lib"` and subpath export `"./some-lib"`), the module fallback service could resolve the bare specifier to the subpath export file instead of the actual npm package. This was particularly triggered when using pnpm, whose symlinked `node_modules` structure caused Vite's resolver to match the subpath export first. The fix uses Node's resolution algorithm for bare specifiers before falling back to Vite's resolver, correctly distinguishing between package names and subpath exports.
