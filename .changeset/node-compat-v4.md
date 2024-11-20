---
"wrangler": major
---

The `--node-compat` flag and `node_compat` config properties are no longer supported as of Wrangler v4. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.

If you need to replicate the behaviour of the legacy `node_compat` feature, refer to https://developers.cloudflare.com/workers/wrangler/migration/update-v3-to-v4/ for a detailed guide.
