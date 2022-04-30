---
"wrangler": patch
---

feat: experimental `--node-compat` / `config.node_compat`

This adds an experimental node.js compatibility mode. It can be enabled by adding `node_compat = true` in `wrangler.toml`, or by passing `--node-compat` as a command line arg for `dev`/`publish` commands. This is currently powered by `@esbuild-plugins/node-globals-polyfill` (which in itself is powered by `rollup-plugin-node-polyfills`).

We'd previously added this, and then removed it because the quality of the polyfills isn't great. We're reintroducing it regardless so we can start getting feedback on its usage, and it sets up a foundation for replacing it with our own, hopefully better maintained polyfills.

Of particular note, this means that what we promised in https://blog.cloudflare.com/announcing-stripe-support-in-workers/ now actually works.

This patch also addresses some dependency issues, specifically leftover entries in package-lock.json.
