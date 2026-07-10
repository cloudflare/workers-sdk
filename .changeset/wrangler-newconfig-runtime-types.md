---
"wrangler": minor
---

Append Workers runtime types to the generated types under `--x-new-config`, with a new `dev.types.includeRuntime` option

When running `wrangler dev --x-new-config`, the runtime types generated from your compatibility date and flags are now appended to `worker-configuration.d.ts`, alongside the types inferred from `cloudflare.config.ts`. This is controlled by a new `dev.types.includeRuntime` option in `wrangler.config.ts`, which defaults to `true`.

This applies to the experimental new config path only and does not change type generation for existing `wrangler.jsonc`/`wrangler.toml` projects.
