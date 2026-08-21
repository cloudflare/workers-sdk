---
"@cloudflare/config": patch
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Fix `TS4023` when a `cloudflare.config.ts` using `defineSettings()` is typechecked with `declaration: true`

`defineSettings()` had no explicit return type, so its inferred type referenced the internal `DEFINITION` symbol. Because that symbol is not part of the public surface, any package compiled with `declaration: true` failed with `error TS4023: Exported variable 'settings' has or is using name 'DEFINITION' from external module "…" but cannot be named.` `defineSettings()` now returns an exported `SettingsDefinition` interface — mirroring how `defineWorker()` returns `TypedWorkerDefinition` — which also pins the `type` discriminant to the literal `"settings"` instead of widening it to `string`.
