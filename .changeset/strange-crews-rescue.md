---
"wrangler": patch
---

chore: update packages

This updates some dependencies. Some highlights -

- updates to `@iarna/toml` means we can have mixed types for inline arrays, which is great for #774 / https://github.com/cloudflare/wrangler2/pull/778
- I also moved timeago.js to `devDependencies` since it already gets compiled into the bundle
- updates to `esbuild` brings along a number of smaller fixes for modern js
