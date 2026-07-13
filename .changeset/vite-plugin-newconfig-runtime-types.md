---
"@cloudflare/vite-plugin": minor
---

Append Workers runtime types to the generated types when using `experimental.newConfig`, with a new `types.includeRuntime` option

When using the experimental new config (`cloudflare.config.ts`), the plugin now appends the Workers runtime types (generated from your compatibility date and flags) to `worker-configuration.d.ts`, alongside the types inferred from your config. This is controlled by a new `experimental.newConfig.types.includeRuntime` option, which defaults to `true`.

As part of this change, types are now generated only during `vite dev` (not `vite build`), since compatibility settings are resolved from the active dev session. This affects the experimental new config path only.
