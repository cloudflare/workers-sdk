---
"wrangler": minor
---

Include runtime types in the output of `wrangler types` by default

`wrangler types` will now produce one file that contains both `Env` types and runtime types based on your compatibility date and flags. This is located at `worker-configuration.d.ts` by default.

This behaviour was previously gated behind `--experimental-include-runtime`. That flag is no longer necessary and has been removed. It has been replaced by `--include-runtime` and `--include-env`, both of which are set to `true` by default. If you were previously using `--x-include-runtime`, you can drop that flag and remove the separate `runtime.d.ts` file.

If you were previously using `@cloudflare/workers-types` we recommend you run uninstall and run `wrangler types` instead. Note that `@cloudflare/workers-types` will continue to be published.
