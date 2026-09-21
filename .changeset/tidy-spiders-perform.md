---
"@cloudflare/unenv-preset": patch
---

Preserve runtime polyfills when bundling `@cloudflare/unenv-preset`

Bundlers now retain side-effect-only polyfills that install runtime globals such as `performance` instead of tree-shaking them from applications.
