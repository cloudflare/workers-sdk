---
"@cloudflare/config": major
---

Release the 1.0 release candidate

This release finalises the binding and Worker field names, and includes breaking changes:

- `firstPartyWorker` moves from the Worker's top level to `experimental.firstPartyWorker`.
- `bindings.pipeline()` takes `streamId` in place of `name`. Set it to the ID of the Pipelines stream, not its name. Legacy pipelines aren't supported.
- `bindings.k2()` takes `id` in place of `stream`. Set it to the ID of the K2 stream.
- `bindings.analytics()` is renamed to `bindings.analyticsSql()`. Its binding type changes from `"analytics"` to `"analytics-sql"`. The `AnalyticsSQLBinding`, `AnalyticsSQLBindingOptions` and `AnalyticsSQLBindingSchema` exports are renamed to `AnalyticsSqlBinding`, `AnalyticsSqlBindingOptions` and `AnalyticsSqlBindingSchema`.
- The `KVBindingSchema` export is renamed to `KvBindingSchema`.
- The `ConnectTriggerOptionsBase` type is no longer exported. Use `ConnectTriggerOptions` instead.
- The `InputWorkerConfig` type is no longer exported. Use `z.input<typeof WorkerConfigSchema>` if you need it.
- The config schemas and their parsed types are renamed after what they describe. The `Input` and `Output` prefixes are replaced by the public type names and `BuildOutput`:
  - `InputConfigSchema` → `CloudflareConfigSchema`, `ParsedInputConfig` → `ParsedCloudflareConfig`
  - `InputSettingsSchema` → `SettingsSchema`, `ParsedInputSettingsConfig` → `ParsedSettings`
  - `InputWorkerSchema` → `WorkerConfigSchema`, `ParsedInputWorkerConfig` → `ParsedWorkerConfig`
  - `InputContainerSchema` → `ContainerConfigSchema`, `ParsedInputContainerConfig` → `ParsedContainerConfig`
  - `OutputRootConfigSchema` → `BuildOutputRootConfigSchema`, `ParsedOutputRootConfig` → `ParsedBuildOutputRootConfig`
  - `OutputWorkerSchema` → `BuildOutputWorkerConfigSchema`, `ParsedOutputWorkerConfig` → `ParsedBuildOutputWorkerConfig`
  - `OutputContainerSchema` → `BuildOutputContainerConfigSchema`, `ParsedOutputContainerConfig` → `ParsedBuildOutputContainerConfig`

Setting the old `name` or `stream` field fails with an error that names the replacement field. Editors also show both fields as deprecated.

The schema no longer fills in defaults. A parsed config without Containers leaves `containers` undefined instead of setting it to `[]`, and a Container without `maxInstances` leaves it undefined instead of setting it to `20`. Deploying still uses 20 instances when `maxInstances` isn't set.

Queue consumer `maxConcurrency` no longer accepts `null`. Wrangler already rejected it.
