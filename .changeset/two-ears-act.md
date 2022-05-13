---
"wrangler": patch
---

`pages dev <dir>` & `wrangler pages functions build` will have a `--node-compat` flag powered by @esbuild-plugins/node-globals-polyfill (which in itself is powered by rollup-plugin-node-polyfills). The only difference in `pages` will be it does not check the `wrangler.toml` so the `node_compat = true`will not enable it for `wrangler pages` functionality.

resolves #890
