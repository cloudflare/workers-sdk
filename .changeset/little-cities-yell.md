---
"@cloudflare/vite-plugin": patch
---

fix: replace `process.env.NODE_ENV` for nodejs_compat builds

make sure that occurrences of `process.env.NODE_ENV` are replaced with the
current `process.env.NODE_ENV` value or `"production"` on builds that include
the `nodejs_compat` flag, this enables libraries checking such value
(e.g. `react-dom`) to be properly treeshaken
