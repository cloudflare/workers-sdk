---
"wrangler": patch
---

feat: Add support for the `nodejs_compat` Compatibility Flag when bundling a Worker with Wrangler

This new Compatibility Flag is incompatible with the legacy `--node-compat` CLI argument and `node_compat` configuration option. If you want to use the new runtime Node.js compatibility features, please remove the `--node-compat` argument from your CLI command or your config file.
