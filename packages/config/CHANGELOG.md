# @cloudflare/config

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
