---
"@cloudflare/unenv-preset": patch
---

Preserve runtime polyfills when bundling `@cloudflare/unenv-preset`

Side-effect-only polyfills are now explicitly marked in the published package metadata so that bundlers do not tree-shake their global assignments.
