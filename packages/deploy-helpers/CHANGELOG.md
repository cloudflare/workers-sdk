# @cloudflare/deploy-helpers

## 0.2.2

### Patch Changes

- [#14354](https://github.com/cloudflare/workers-sdk/pull/14354) [`7649895`](https://github.com/cloudflare/workers-sdk/commit/764989568ecbfadd111fc399c83d71dd9ce6cf1b) Thanks [@emily-shen](https://github.com/emily-shen)! - Move resource provisioning into deploy helpers

  Worker deploy and versions upload now share the deploy helpers implementation for provisioning bindings, reducing Wrangler-specific callback wiring while preserving existing behavior.

- Updated dependencies [[`b38823f`](https://github.com/cloudflare/workers-sdk/commit/b38823fb35a8bdcd00004e74404ab18d7b070dbf), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359)]:
  - miniflare@4.20260617.1
  - @cloudflare/workers-utils@0.24.0
  - @cloudflare/cli-shared-helpers@0.1.10

## 0.2.1

### Patch Changes

- [#14347](https://github.com/cloudflare/workers-sdk/pull/14347) [`673b09e`](https://github.com/cloudflare/workers-sdk/commit/673b09e0fa26368125fb527596a8eb5d31c27302) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Update undici from 7.24.8 to 7.28.0

- [#14340](https://github.com/cloudflare/workers-sdk/pull/14340) [`f6e49dd`](https://github.com/cloudflare/workers-sdk/commit/f6e49dd59190328007331477450651e8bca2def8) Thanks [@emily-shen](https://github.com/emily-shen)! - add `skipLastDeployedFromApiCheck` to override deploy source check

- [#14269](https://github.com/cloudflare/workers-sdk/pull/14269) [`5dfb788`](https://github.com/cloudflare/workers-sdk/commit/5dfb788595a2104b4b0922cfce3d69a2f1d881eb) Thanks [@mattjohnsonpint](https://github.com/mattjohnsonpint)! - Support `dev.plugin` on typed services bindings

  Wrangler only honored `dev.plugin` on `unsafe.bindings` entries, so users authoring a service binding via `services[]` could not wire it to a local Miniflare plugin during `wrangler dev` — they had to fall back to `unsafe.bindings` and accept a "directly supported by wrangler" warning. Typed services bindings now accept the same `dev: { plugin, options? }` shape, route the binding through Miniflare's external-plugin pathway in `wrangler dev`, and strip the field at deploy time. Validation rejects malformed `dev` shapes.

- Updated dependencies [[`673b09e`](https://github.com/cloudflare/workers-sdk/commit/673b09e0fa26368125fb527596a8eb5d31c27302), [`e930bd4`](https://github.com/cloudflare/workers-sdk/commit/e930bd4ca9880eb0b68ce6d1933c1d9ce290317d), [`5c3bb11`](https://github.com/cloudflare/workers-sdk/commit/5c3bb118a99da70c5c1efb07df37f685e7044ba6), [`296ad65`](https://github.com/cloudflare/workers-sdk/commit/296ad659305ee150d61451991f04a135fe99d264), [`5dfb788`](https://github.com/cloudflare/workers-sdk/commit/5dfb788595a2104b4b0922cfce3d69a2f1d881eb)]:
  - @cloudflare/workers-utils@0.23.2
  - miniflare@4.20260617.0
  - @cloudflare/cli-shared-helpers@0.1.9

## 0.2.0

### Minor Changes

- [#14321](https://github.com/cloudflare/workers-sdk/pull/14321) [`88662aa`](https://github.com/cloudflare/workers-sdk/commit/88662aa727a6b9d576578dc9cdc3b2911efcd89b) Thanks [@emily-shen](https://github.com/emily-shen)! - re-export OutputWorkerSchema from internal config package

- [#14265](https://github.com/cloudflare/workers-sdk/pull/14265) [`e3fce14`](https://github.com/cloudflare/workers-sdk/commit/e3fce14228f6e064d5d7408508107774fa38c296) Thanks [@emily-shen](https://github.com/emily-shen)! - Expose Cloudflare config conversion utilities from deploy helpers

  `@cloudflare/deploy-helpers` now re-exports `ConfigSchema` and `convertToWranglerConfig` from the internal `@cloudflare/config` package, so consumers can parse and convert Cloudflare config files without depending on the unpublished package directly.

### Patch Changes

- [#14265](https://github.com/cloudflare/workers-sdk/pull/14265) [`e3fce14`](https://github.com/cloudflare/workers-sdk/commit/e3fce14228f6e064d5d7408508107774fa38c296) Thanks [@emily-shen](https://github.com/emily-shen)! - Bundle private internal dependencies in deploy helpers

  `@cloudflare/deploy-helpers` no longer declares private workspace packages as runtime dependencies, so installing the package from npm does not require unpublished internal packages.

- [#14304](https://github.com/cloudflare/workers-sdk/pull/14304) [`ee82c76`](https://github.com/cloudflare/workers-sdk/commit/ee82c76b07844f7ae9068b01d29a2a0adf34eed0) Thanks [@emily-shen](https://github.com/emily-shen)! - Skip resource provisioning for asset-only deployments

  Previously, asset-only deployments would provision resources even when there was no user Worker script. On a subsequent deploy, we would re-attempt provisioning as the previous asset-only upload would/could not be bound to the previously provisioned resource. Provisioning would then error as the resource had already been created, blocking the deploy.

- Updated dependencies [[`0e055d3`](https://github.com/cloudflare/workers-sdk/commit/0e055d39c51dda77717515adb1a33610d385a724), [`27db82c`](https://github.com/cloudflare/workers-sdk/commit/27db82c808743f690f023f84be5cde9e223c22d1), [`2a6a26b`](https://github.com/cloudflare/workers-sdk/commit/2a6a26b02f27ac18b1773a5460e1e7e37721a5cb), [`9a424ed`](https://github.com/cloudflare/workers-sdk/commit/9a424ed747009c716db77463c72f8d974e048914), [`ecfdd5a`](https://github.com/cloudflare/workers-sdk/commit/ecfdd5a6c60b9c6f99c28f9294da656933c2a5fd), [`41f391f`](https://github.com/cloudflare/workers-sdk/commit/41f391fdda4112ee333782aad02d16dacaa95f8f)]:
  - miniflare@4.20260616.0
  - @cloudflare/workers-utils@0.23.1
  - @cloudflare/cli-shared-helpers@0.1.8

## 0.1.3

### Patch Changes

- [#14259](https://github.com/cloudflare/workers-sdk/pull/14259) [`2ae6099`](https://github.com/cloudflare/workers-sdk/commit/2ae6099db77c076fb7e6e782d2f0ebd7ba86dbbb) Thanks [@emily-shen](https://github.com/emily-shen)! - Move worker build step earlier in deploy/upload step, before upload specific config validation

- Updated dependencies [[`f3990b2`](https://github.com/cloudflare/workers-sdk/commit/f3990b2358ef49cd6e1ab16de27e25dcd949896f), [`4597f08`](https://github.com/cloudflare/workers-sdk/commit/4597f085d25c7d066ecf056de313e194f41094d1), [`2047a32`](https://github.com/cloudflare/workers-sdk/commit/2047a32cf78886b71b794a3dfac946a146ab3ffe)]:
  - miniflare@4.20260611.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`c6c61b5`](https://github.com/cloudflare/workers-sdk/commit/c6c61b59431443b2bcda25f3af7624dd2ce19b9b), [`b502d54`](https://github.com/cloudflare/workers-sdk/commit/b502d5445b9e9e030020a3d65c0334507393aa64), [`c4f45e8`](https://github.com/cloudflare/workers-sdk/commit/c4f45e8b8694c60fb1808f7fbb130e4b4893d20c)]:
  - @cloudflare/workers-utils@0.23.0

## 0.1.1

### Patch Changes

- [#14063](https://github.com/cloudflare/workers-sdk/pull/14063) [`65b5f9e`](https://github.com/cloudflare/workers-sdk/commit/65b5f9e1855651c2df2c1bdfc8930141e36413d5) Thanks [@emily-shen](https://github.com/emily-shen)! - Move fetch helpers into `@cloudflare/workers-utils`

  Shared Cloudflare API fetch helper types and plumbing now live in `@cloudflare/workers-utils` so Wrangler and other clients can use the same implementation.

## 0.1.0

### Minor Changes

- [#14014](https://github.com/cloudflare/workers-sdk/pull/14014) [`d042705`](https://github.com/cloudflare/workers-sdk/commit/d042705c7a8715184e6e16d399c17adb958d0e80) Thanks [@emily-shen](https://github.com/emily-shen)! - Add `@cloudflare/deploy-helpers` package.

  This introduces a shared internal package for deploy-related helper types and code.
