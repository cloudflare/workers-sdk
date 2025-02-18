---
"wrangler": minor
---

Include runtime types in the output of `wrangler types`

`wrangler types` will now produce one file that contains both `Env` types and runtime types based on your compatibility date and flags. This is located at `worker-configuration.d.ts` by default.

This behaviour was previously gated behind `--experimental-include-runtime`. That flag is no longer necessary and has been removed. It has been replaced by `--include-runtime` and `include-env`, both of which are set to `true` by default.
