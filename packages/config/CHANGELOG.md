# @cloudflare/config

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
