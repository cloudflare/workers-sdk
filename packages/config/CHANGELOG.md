# @cloudflare/config

## 0.9.0

### Minor Changes

- [#15373](https://github.com/cloudflare/workers-sdk/pull/15373) [`3650d29`](https://github.com/cloudflare/workers-sdk/commit/3650d29f1cfcd6db103c25d22819e8fe41d592f3) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Rename Worker target fields from `workerName` to `worker`

  The experimental `@cloudflare/config` and Miniflare configuration APIs now use `worker` consistently for Worker, Durable Object, Workflow, dispatch namespace, and tail consumer targets.

## 0.8.0

### Minor Changes

- [#15326](https://github.com/cloudflare/workers-sdk/pull/15326) [`9fcb1c9`](https://github.com/cloudflare/workers-sdk/commit/9fcb1c9c0a8a0edee04675c4446cd88b34c85b8a) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Rename the settings config schema exports to the input/output convention

  `SettingsSchema` is now `InputSettingsSchema` and `ParsedSettingsConfig` is now `ParsedInputSettingsConfig`.

- [#15326](https://github.com/cloudflare/workers-sdk/pull/15326) [`9fcb1c9`](https://github.com/cloudflare/workers-sdk/commit/9fcb1c9c0a8a0edee04675c4446cd88b34c85b8a) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Record the selected mode in the Build Output Specification top-level `config.json`

  The mode a build was produced in is now written to `.cloudflare/output/v0/config.json` as a `mode` field, alongside the account and compliance settings.

- [#15318](https://github.com/cloudflare/workers-sdk/pull/15318) [`82d11fc`](https://github.com/cloudflare/workers-sdk/commit/82d11fca0c826ef54000e5fbe1dc87db73a5ef9c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Consolidate development-only binding configuration under `dev`

  This experimental configuration now uses `dev.remote` for remote bindings and `dev.connectionString` for Hyperdrive. Miniflare's v5 binding configuration follows the same shape, and R2's local S3 credentials now share the `dev` object.

- [#15325](https://github.com/cloudflare/workers-sdk/pull/15325) [`7f66836`](https://github.com/cloudflare/workers-sdk/commit/7f668362bd5675afb95c1cb5128fad6aa092a430) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Reject conflicting destination restrictions in send-email bindings

  Send-email bindings now match Wrangler validation by allowing either `destinationAddress` or `allowedDestinationAddresses`, but not both. `allowedSenderAddresses` remains an independent restriction that can accompany either destination mode.

### Patch Changes

- [#15324](https://github.com/cloudflare/workers-sdk/pull/15324) [`ead8f69`](https://github.com/cloudflare/workers-sdk/commit/ead8f69e85efa758dd066b4d1cfc2fec406939dd) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix the inferred type of `ConfigExportsSchema` to reserve the `settings` key for settings configuration

  Parsed config exports now expose `settings` as a settings configuration while treating all other exports as Worker configurations. Validation continues to report specific errors when a settings configuration uses the wrong export name or the reserved name contains a Worker configuration, and now explains how to handle unsupported exports.

- [#15297](https://github.com/cloudflare/workers-sdk/pull/15297) [`acb14d0`](https://github.com/cloudflare/workers-sdk/commit/acb14d01d64f21f0f21c247da7c2fcb0557ebb3d) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix declaration emit for values returned by `defineSettings`

  Projects can now export a `defineSettings()` result while generating TypeScript declarations without encountering TS4023.

## 0.7.0

### Minor Changes

- [#14995](https://github.com/cloudflare/workers-sdk/pull/14995) [`59872c4`](https://github.com/cloudflare/workers-sdk/commit/59872c41d4417d9b8c2efddb4b35662453efcaae) Thanks [@ThomasRubini](https://github.com/ThomasRubini)! - Add `connect` trigger for raw sockets

  You can now configure a Worker to receive raw socket connections during `wrangler dev`, delivered directly to the Worker's `connect(socket, env, ctx)` handler:

  ```jsonc
  {
    "connect": [{ "protocol": "tcp", "port": 5432 }]
  }
  ```

  Each entry opens a listening socket on `127.0.0.1` (or the given `address`) that forwards incoming connections straight to the Worker, bypassing the local dev HTTP entry point. This requires the `experimental` compatibility flag. Only `"tcp"` is supported at the moment.

  `@cloudflare/config` also supports declaring this trigger via `triggers.connect(...)`, which lowers to the `connect` field above:

  ```ts
  import { defineWorker, triggers } from "@cloudflare/config";

  export default defineWorker({
    triggers: [
      triggers.connect({ protocol: "tcp", port: 5432, address: "127.0.0.1" }),
    ],
  });
  ```

- [#15130](https://github.com/cloudflare/workers-sdk/pull/15130) [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864) Thanks [@emily-shen](https://github.com/emily-shen)! - Add R2 local S3 credentials to the shared config binding shape

  R2 bindings now support `localDev.experimentalS3Credentials`, matching Wrangler's existing local S3 endpoint credentials configuration.

### Patch Changes

- [#15130](https://github.com/cloudflare/workers-sdk/pull/15130) [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864) Thanks [@emily-shen](https://github.com/emily-shen)! - Default local Analytics Engine dataset names in Miniflare

  Analytics Engine dataset bindings without an explicit `name` now fallback to the worker and binding name as a default.

- [#15130](https://github.com/cloudflare/workers-sdk/pull/15130) [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864) Thanks [@emily-shen](https://github.com/emily-shen)! - Remove unsupported `remote` configuration from Workflow bindings

  Workflow bindings no longer accept `remote` in configuration, as remote Workflow bindings have never actually been supported.

## 0.6.0

### Minor Changes

- [#15026](https://github.com/cloudflare/workers-sdk/pull/15026) [`6529f0c`](https://github.com/cloudflare/workers-sdk/commit/6529f0ca5ecda93f67efbaa72a7f9a9f8fd814bf) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add a `container` option to `exports.durableObject()`

  Live Durable Object exports can now attach a container by name, matching the new `container` field in the Wrangler configuration format:

  ```typescript
  import { defineWorker, exports } from "@cloudflare/config";

  export default defineWorker({
    name: "my-worker",
    compatibilityDate: "2026-07-01",
    exports: {
      MyContainerDO: exports.durableObject({
        storage: "sqlite",
        container: "my-container",
      }),
    },
  });
  ```

  Containers are only supported on the SQLite storage engine, so `container` is only offered alongside `storage: "sqlite"`. Passing it with `storage: "legacy-kv"` is a type error rather than something only caught on deploy:

  ```typescript
  exports.durableObject({
    storage: "legacy-kv",
    // Object literal may only specify known properties,
    // and 'container' does not exist in type '{ storage: "legacy-kv" }'
    container: "my-container",
  });
  ```

  This is an experimental feature: containers themselves are not yet configurable from `cloudflare.config.ts`, so the field is only useful once they are.

## 0.5.0

### Minor Changes

- [#14994](https://github.com/cloudflare/workers-sdk/pull/14994) [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3) Thanks [@emily-shen](https://github.com/emily-shen)! - Export binding and export schemas

  `@cloudflare/config` now exports individual binding and export schemas, plus `validateSingletonBindings`, for callers that need to compose the Worker config schema.

## 0.4.0

### Minor Changes

- [#14905](https://github.com/cloudflare/workers-sdk/pull/14905) [`b21eac2`](https://github.com/cloudflare/workers-sdk/commit/b21eac24878f060296915f198fae910268c465ef) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Move build output utils to new `@cloudflare/build-output-utils` package

## 0.3.0

### Minor Changes

- [#14724](https://github.com/cloudflare/workers-sdk/pull/14724) [`a50f73a`](https://github.com/cloudflare/workers-sdk/commit/a50f73a06bb7b078268ce9cebb4d1c16f79a3144) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add a `settings` export to the experimental `cloudflare.config.ts` config

  Account-level settings (`accountId`, `complianceRegion`) now live in a dedicated, named `settings` export authored via `defineSettings`, rather than on the Worker config. A `cloudflare.config.ts` can export at most one `settings` object; the Worker itself is the `default` export.

  ```ts
  // cloudflare.config.ts
  import { defineSettings, defineWorker } from "wrangler/experimental-config";
  import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

  export const settings = defineSettings({
  	accountId: "<your-account-id>",
  });

  export default defineWorker({
  	name: "my-worker",
  	entrypoint,
  	compatibilityDate: "2026-05-18",
  });
  ```

  This is only used behind the experimental new-config path (`wrangler --experimental-new-config` and the `@cloudflare/vite-plugin` `experimental.newConfig` option).

## 0.2.1

### Patch Changes

- [#14707](https://github.com/cloudflare/workers-sdk/pull/14707) [`b38f494`](https://github.com/cloudflare/workers-sdk/commit/b38f494204e5e08e561b8f198ef928188e554868) Thanks [@emily-shen](https://github.com/emily-shen)! - Update zod to v4

## 0.2.0

### Minor Changes

- [#14689](https://github.com/cloudflare/workers-sdk/pull/14689) [`2cd84d4`](https://github.com/cloudflare/workers-sdk/commit/2cd84d455cfa174ff7264e94e678b6d2eb2a25e4) Thanks [@emily-shen](https://github.com/emily-shen)! - Publish `@cloudflare/config` package

  `@cloudflare/config` is now published as a standalone package. Previously, its exports (`InputWorkerSchema`, `OutputWorkerSchema`, `convertToWranglerConfig`, and related types) were re-exported through `@cloudflare/deploy-helpers`. Consumers should import directly from `@cloudflare/config` instead.

  `@cloudflare/deploy-helpers` no longer re-exports `@cloudflare/config` symbols.
