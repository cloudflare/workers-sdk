# @cloudflare/autoconfig

## 0.1.2

### Patch Changes

- Updated dependencies [[`aa5d580`](https://github.com/cloudflare/workers-sdk/commit/aa5d5801450b7e4417bfdbd477f86de3a4bc6933)]:
  - @cloudflare/workers-utils@0.25.0
  - @cloudflare/cli-shared-helpers@0.1.11

## 0.1.1

### Patch Changes

- [#14368](https://github.com/cloudflare/workers-sdk/pull/14368) [`a55b29a`](https://github.com/cloudflare/workers-sdk/commit/a55b29a4ba8a24f4d539538e2bf38e6a7e5b8e52) Thanks [@penalosa](https://github.com/penalosa)! - Add repository URL to `@cloudflare/autoconfig`

## 0.1.0

### Minor Changes

- [#14365](https://github.com/cloudflare/workers-sdk/pull/14365) [`f224ce2`](https://github.com/cloudflare/workers-sdk/commit/f224ce2009b6844a606eb53a71fb114434e8a7a0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add experimental package for framework autoconfig detection and configuration

- [#14365](https://github.com/cloudflare/workers-sdk/pull/14365) [`f224ce2`](https://github.com/cloudflare/workers-sdk/commit/f224ce2009b6844a606eb53a71fb114434e8a7a0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add support for React Router >= 8.0.0

  React Router v8 enables `viteEnvironmentApi` and `middleware` by default, so autoconfig no longer adds `future` flags to `react-router.config.ts` for v8+ projects and uses the middleware code pattern unconditionally.

### Patch Changes

- Updated dependencies [[`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359)]:
  - @cloudflare/workers-utils@0.24.0
  - @cloudflare/cli-shared-helpers@0.1.10
