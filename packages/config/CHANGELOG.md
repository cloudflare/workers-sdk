# @cloudflare/config

## 0.2.1

### Patch Changes

- [#14707](https://github.com/cloudflare/workers-sdk/pull/14707) [`b38f494`](https://github.com/cloudflare/workers-sdk/commit/b38f494204e5e08e561b8f198ef928188e554868) Thanks [@emily-shen](https://github.com/emily-shen)! - Update zod to v4

## 0.2.0

### Minor Changes

- [#14689](https://github.com/cloudflare/workers-sdk/pull/14689) [`2cd84d4`](https://github.com/cloudflare/workers-sdk/commit/2cd84d455cfa174ff7264e94e678b6d2eb2a25e4) Thanks [@emily-shen](https://github.com/emily-shen)! - Publish `@cloudflare/config` package

  `@cloudflare/config` is now published as a standalone package. Previously, its exports (`InputWorkerSchema`, `OutputWorkerSchema`, `convertToWranglerConfig`, and related types) were re-exported through `@cloudflare/deploy-helpers`. Consumers should import directly from `@cloudflare/config` instead.

  `@cloudflare/deploy-helpers` no longer re-exports `@cloudflare/config` symbols.
